/**
 * @fileoverview US-305 红测试共用的 {@link TransactionExecutor} 替身。
 *
 * @remarks
 * 它**不是**内存数据库，而且刻意不长成数据库：`find()` 只认
 * `{ combinator: 'and' | 'or', rules: [...] }` 里这一小撮算子——
 * `'=' | '!=' | 'in' | 'notIn' | 'null' | 'notNull' | '>'`，外加 `orderBy` / `limit`，
 * 遇到别的**直接抛**。
 *
 * 「只支持一点点、其余抛错」是这个替身能被信任的全部理由。若改成「不认识就返回全部」
 * 或「不认识就返回空」，实现里一条写错的 where 会安静地拿到一个看起来合理的结果集，
 * 测试照常绿——那时这个替身就成了第三份真相，而且是骗人的那份。
 *
 * `>` 与 `orderBy` 是被捕获运行时逼出来的，两者都不是「顺手加的」：`readChangesAfter()`
 * 的水位线条件用 `>`，而 `readChangeWatermark()` 是 `ORDER BY id DESC LIMIT 1`——
 * 不实现排序的话它会安静地返回插入序的第一行，于是水位线永远停在最早那条，
 * 捕获把先前的历史一并认领，而用例全程是绿的。
 *
 * 真实 SQL 行为由 `workingTreeCommitConformanceSuite`（T042/T043）在六个后端上验证。
 */

import { vi } from 'vitest';
import type { EntityType } from '../../../entity/entity.interface.js';
import type { RuleGroup } from '../../../repository/query.interface.js';
import type { IRepository } from '../../../repository/repository.interface.js';
import { getEntityMetadata } from '../../../rxdb-utils.js';
import type { TransactionExecutor } from '../../../transaction/transaction-executor.interface.js';
import { fakeTableRef } from '../../fixtures/fake-table-ref.js';

interface ProbeRule {
  field: string;
  operator: string;
  value?: unknown;
}

interface ProbeGroup {
  combinator: 'and' | 'or';
  rules: (ProbeGroup | ProbeRule)[];
}

const isGroup = (node: ProbeGroup | ProbeRule): node is ProbeGroup => 'combinator' in node;

const matchesRule = (row: Record<string, unknown>, rule: ProbeRule): boolean => {
  const actual = row[rule.field];
  switch (rule.operator) {
    case '=':
      return actual === rule.value;
    case '!=':
      return actual !== rule.value;
    case 'in':
      return Array.isArray(rule.value) && rule.value.includes(actual);
    case 'notIn':
      return Array.isArray(rule.value) && !rule.value.includes(actual);
    case 'null':
      return actual === null || actual === undefined;
    case 'notNull':
      return actual !== null && actual !== undefined;
    // 水位线增量（`capture-hook.ts` 的 readChangesAfter）只用得上 `>`，所以这里也只加 `>`。
    // 顺手把六个比较运算符补全的话，替身就开始支持实现并不会发出的查询形状，
    // 而「支持的每一种形状都有人真的在用」正是它敢被信任的前提。
    case '>':
      return typeof actual === 'number' && typeof rule.value === 'number' && actual > rule.value;
    default:
      throw new Error(`commit-graph-probe: unsupported operator '${rule.operator}' on field '${rule.field}'`);
  }
};

const matches = (row: Record<string, unknown>, node: ProbeGroup | ProbeRule): boolean => {
  if (!isGroup(node)) return matchesRule(row, node);
  if (node.rules.length === 0) return true;
  return node.combinator === 'and' ?
      node.rules.every(child => matches(row, child))
    : node.rules.some(child => matches(row, child));
};

/** `orderBy` 的一项；替身只按单列比大小，多列排序没有调用方要求过。 */
interface OrderBySpec {
  field: string;
  sort?: 'asc' | 'desc';
}

/**
 * 按 `orderBy` 排一遍命中行
 *
 * @remarks
 * 不排的话，`ORDER BY id DESC LIMIT 1` 会退化成「取插入顺序的第一行」——而
 * `readChangeWatermark()` 正是靠这个形状取最大 change id。替身返回一个**看起来合理的**
 * 旧水位线时，捕获会把水位线之前的历史变更一并当成本次事务的产物，测试照常绿。
 */
const sortRows = <T>(rows: readonly T[], orderBy: readonly OrderBySpec[] | undefined): T[] => {
  const first = orderBy?.[0];
  if (!first) return [...rows];
  const direction = first.sort === 'desc' ? -1 : 1;
  return [...rows].sort((left, right) => {
    const a = (left as Record<string, unknown>)[first.field];
    const b = (right as Record<string, unknown>)[first.field];
    if (a === b) return 0;
    if (typeof a === 'number' && typeof b === 'number') return (a - b) * direction;
    return String(a).localeCompare(String(b)) * direction;
  });
};

/** 一次 `find()` 的原样记录，供断言「查了哪张表、用了什么条件」。 */
export interface ProbeFindCall {
  readonly entity: string;
  readonly where: RuleGroup;
}

export interface CommitGraphProbe {
  readonly executor: TransactionExecutor;
  /** 按调用顺序记下全部 `find()` */
  readonly finds: ProbeFindCall[];
  /** 经 `executor.query()` 发出的原始语句 */
  readonly statements: string[];
  /** 经 `saveMany()` 落库的行，按调用顺序摊平 */
  readonly saved: InstanceType<EntityType>[];
  /** 往某张表里塞行（测试布景用） */
  seed(EntityClass: EntityType, rows: readonly object[]): void;
  /** 读某张表当前的行 */
  rowsOf(EntityClass: EntityType): object[];
}

/** {@link createCommitGraphProbe} 的可调项。 */
export interface CommitGraphProbeOptions {
  /** `executor.query()` 的固定 `rowsAffected`；CAS 命中与否由它决定。默认 0（未命中） */
  readonly rowsAffected?: number;
  /** 覆盖写入行为，用于「INSERT 撞唯一约束」这一支 */
  readonly saveMany?: (entities: InstanceType<EntityType>[]) => Promise<InstanceType<EntityType>[]>;
}

/**
 * 造一个按实体名分表的 {@link TransactionExecutor} 替身。
 *
 * @param options - 见 {@link CommitGraphProbeOptions}
 */
export function createCommitGraphProbe(options: CommitGraphProbeOptions = {}): CommitGraphProbe {
  const rawQueryResult = { rowsAffected: options.rowsAffected ?? 0 };
  const tables = new Map<string, object[]>();
  const finds: ProbeFindCall[] = [];
  const statements: string[] = [];
  const saved: InstanceType<EntityType>[] = [];

  const tableOf = (EntityClass: EntityType): object[] => {
    const { name } = getEntityMetadata(EntityClass);
    const rows = tables.get(name) ?? [];
    tables.set(name, rows);
    return rows;
  };

  const executor: TransactionExecutor = {
    id: 'commit-graph-probe',
    state: 'active',
    query: vi.fn(async (sql: string) => {
      statements.push(sql);
      return { ...rawQueryResult, rows: [], columns: [] };
    }),
    tableRef: fakeTableRef,
    mutations: vi.fn(async () => []),
    getRepository: <T extends EntityType>(EntityClass: T): IRepository<T> => {
      const { name } = getEntityMetadata(EntityClass);
      const rows = tableOf(EntityClass);
      return {
        find: vi.fn(async options => {
          finds.push({ entity: name, where: options.where as RuleGroup });
          const hits = rows.filter(row =>
            matches(row as Record<string, unknown>, options.where as unknown as ProbeGroup)
          );
          const ordered = sortRows(hits, options.orderBy as OrderBySpec[] | undefined);
          return ordered.slice(0, options.limit ?? ordered.length) as InstanceType<T>[];
        }),
        count: vi.fn(async options => {
          finds.push({ entity: name, where: options.where as RuleGroup });
          return rows.filter(row => matches(row as Record<string, unknown>, options.where as unknown as ProbeGroup))
            .length;
        }),
        create: vi.fn(async entity => {
          rows.push(entity as object);
          return entity;
        }),
        update: vi.fn(async (entity, patch) => Object.assign(entity as object, patch) as InstanceType<T>),
        remove: vi.fn(async entity => {
          const index = rows.indexOf(entity as object);
          if (index >= 0) rows.splice(index, 1);
          return entity;
        })
      };
    },
    saveMany: (options.saveMany ??
      (async (entities: InstanceType<EntityType>[]) => {
        for (const entity of entities) {
          tableOf(entity.constructor as EntityType).push(entity);
          saved.push(entity);
        }
        return entities;
      })) as TransactionExecutor['saveMany'],
    removeMany: vi.fn(async entities => entities),
    mergeChanges: vi.fn(async () => undefined),
    run: fn => fn(executor)
  };

  return {
    executor,
    finds,
    statements,
    saved,
    seed(EntityClass, rows) {
      tableOf(EntityClass).push(...(rows as object[]));
    },
    rowsOf(EntityClass) {
      return tableOf(EntityClass);
    }
  };
}

/** 空白归一 + 小写，便于对语句形状做断言。 */
export const normalizeSql = (sql: string): string => sql.replace(/\s+/g, ' ').trim().toLowerCase();

/** 取 `SET` 与 `WHERE` 之间那一段。 */
export const setClauseOf = (sql: string): string => /\bset\b(.*?)\bwhere\b/s.exec(normalizeSql(sql))?.[1] ?? '';

/** 取 `WHERE` 之后那一段。 */
export const whereClauseOf = (sql: string): string => /\bwhere\b(.*)$/s.exec(normalizeSql(sql))?.[1] ?? '';
