import { EntityMetadata, EntityType, getEntityMetadata } from '@aiao/rxdb';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import inserts_sql from '../entity/inserts_sql.js';
import create_table_sql from './create_table_sql.js';
import { generate_trigger_sql } from './trigger_sql.js';

/** `generate_trigger_sql` 用来分隔多条语句的哨兵（函数体里含分号，不能按分号切） */
const STATEMENT_SEPARATOR = '---STATEMENT_SEPARATOR---';

/**
 * 追加一条语句，统一补上分号。
 *
 * 上游各 generator 的返回值有的自带分号、有的不带，直接字符串拼接会得到
 * 「两条语句挤在一行」这种不可执行的形态。
 */
const appendStatement = (statements: string[], sql: string): void => {
  const trimmed = sql.trim();
  if (!trimmed) return;
  statements.push(trimmed.endsWith(';') ? trimmed : `${trimmed};`);
};

/** 去掉注释行后的正文，用于判定语句种类（纯注释块返回空串） */
const sqlBody = (statement: string): string =>
  statement
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .trim();

/**
 * 该语句是否必须等所有表建完再执行。
 *
 * `create_table_sql` 里写着「外键约束将在所有表创建完成后统一添加」，
 * 但它把 `ADD CONSTRAINT` 直接拼在每个实体自己的语句块里 ——
 * **注释描述的是一个没有实现的意图**。外键指向的表往往还没建，
 * 于是干净库上执行报 `relation "shop.user" does not exist`（PGL-014）。
 * 这里按语句种类真正做延后。
 */
const isDeferredStatement = (body: string): boolean =>
  /^ALTER\s+TABLE\b[\s\S]*\bADD\s+CONSTRAINT\b/i.test(body) || /^CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(body);

/** 把某个 generator 返回的语句块拆成单条语句 */
const splitStatements = (blob: string): string[] =>
  blob
    .split(/;\s*\n/)
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0);

/**
 * 生成多张表的创建语句列表
 *
 * 按**阶段**排序，而不是按传入顺序边建表边建 trigger：
 * 1. `CREATE SCHEMA`（所有非 public namespace）
 * 2. 全部 `CREATE TABLE` 与 `ADD COLUMN`
 * 3. 全部外键约束与索引（必须等所有表建完）
 * 4. 全部触发器（仅对 log !== false 的实体）
 * 5. 初始数据 INSERT（可选）
 *
 * 交错生成时，外键会指向还没建的表、trigger 会引用还没建的 change 表，
 * 干净库上依次报 `schema … does not exist` / `relation … does not exist`（PGL-014）。
 *
 * @param adapter - PGlite 适配器实例
 * @param EntityTypes - 实体类型数组
 * @param entities - 可选的初始数据实体数组
 * @returns 逐条可执行的 SQL 语句数组
 *
 * @example
 * ```typescript
 * for (const statement of await create_tables_statements(adapter, [User, Todo])) {
 *   await adapter.internalQuery(statement);
 * }
 * ```
 * @public
 */
export async function create_tables_statements<T extends EntityType>(
  adapter: RxDBAdapterPGlite,
  EntityTypes: T[],
  entities?: InstanceType<T>[]
): Promise<string[]> {
  const schemaStatements: string[] = [];
  const tableStatements: string[] = [];
  const constraintStatements: string[] = [];
  const indexStatements: string[] = [];
  const triggerStatements: string[] = [];
  const insertStatements: string[] = [];
  const namespaces = new Set<string>();

  for (const EntityType of EntityTypes) {
    const metadata = getEntityMetadata(EntityType);

    // 0. CREATE SCHEMA。适配器自己的建库路径（RxDBAdapterPGlite `CREATE SCHEMA IF NOT EXISTS`）
    // 有这一步，公开 helper 没有 —— 于是它的输出在干净库上必然报 `schema "shop" does not exist`。
    if (metadata.namespace && metadata.namespace !== 'public') {
      namespaces.add(metadata.namespace);
    }

    // 1./2. CREATE TABLE 与外键/索引分开：后者必须等所有表建完
    for (const statement of splitStatements(create_table_sql(adapter, metadata))) {
      const body = sqlBody(statement);
      if (!body) continue;
      if (/^CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(body)) {
        appendStatement(indexStatements, statement);
      } else {
        appendStatement(isDeferredStatement(body) ? constraintStatements : tableStatements, statement);
      }
    }

    // 2. 触发器（仅对 log !== false 的实体）
    if (metadata.log !== false) {
      const triggerSQL = generate_trigger_sql(metadata, {
        resolveEntityMetadata: adapter.encryptionContext.resolveEntityMetadata
      });
      // 哨兵是给拆分用的，绝不能原样留在返回值里 —— 送进 PG 就是 42601
      for (const statement of triggerSQL.split(STATEMENT_SEPARATOR)) {
        appendStatement(triggerStatements, statement);
      }
    }
  }

  // 3. 初始数据插入语句
  if (entities && entities.length > 0) {
    const entityMap = new Map<EntityMetadata, Set<InstanceType<T>>>();

    entities.forEach(entity => {
      const metadata = getEntityMetadata(entity);
      if (!entityMap.has(metadata)) {
        entityMap.set(metadata, new Set());
      }
      entityMap.get(metadata)!.add(entity);
    });

    for (const [metadata, entitySet] of entityMap.entries()) {
      const insertSQL = await inserts_sql(
        metadata,
        Array.from(entitySet),
        adapter.rxdb.context,
        adapter.encryptionContext
      );
      appendStatement(insertStatements, insertSQL);
    }
  }

  for (const namespace of namespaces) {
    appendStatement(schemaStatements, `CREATE SCHEMA IF NOT EXISTS "${namespace}"`);
  }

  return [
    ...schemaStatements,
    ...tableStatements,
    ...indexStatements,
    ...constraintStatements,
    ...triggerStatements,
    ...insertStatements
  ];
}

/**
 * 生成多张表的创建 SQL（多语句串）
 *
 * 是 {@link create_tables_statements} 的拼接形式，语句间以分号分隔，
 * 顺序同样是「全部建表 → 全部触发器 → 初始数据」。
 *
 * 返回值必须走**简单查询协议**（多语句），不能用扩展协议的单语句接口。
 * 此前返回值里保留着语句分隔哨兵，按文档示例执行必然报 42601（PGL-014）。
 *
 * @param adapter - PGlite 适配器实例
 * @param EntityTypes - 实体类型数组
 * @param entities - 可选的初始数据实体数组
 * @returns 以分号分隔的多语句 SQL
 *
 * @example
 * ```typescript
 * // 多语句：必须用 exec（简单查询协议）
 * const sql = await create_tables_sql(adapter, [User, Todo]);
 * await client.exec(sql);
 *
 * // 想逐条执行时用 create_tables_statements
 * ```
 */
export async function create_tables_sql<T extends EntityType>(
  adapter: RxDBAdapterPGlite,
  EntityTypes: T[],
  entities?: InstanceType<T>[]
): Promise<string> {
  return (await create_tables_statements(adapter, EntityTypes, entities)).join('\n');
}

export default create_tables_sql;
