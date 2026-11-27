import type { RawQueryResult, TransactionExecutor } from '@aiao/rxdb';

import { migrateDesktopHome } from './desktop-home-migration';

/**
 * 桌面本地库的 schema 版本（ADESK-US-106）。
 *
 * 四种版本各管一件事，**是否兼容只由这一个判定**：
 *
 * 1. 构建版本——发布出去的产物（短 SHA、Pages 部署编号），用来定位「上一版」与回滚目标，不参与兼容判断；
 * 2. **库的 schema 版本**（本文件）——库里记录的结构版本，决定库能不能打开、要不要升级、能不能降级；
 * 3. 种子版本——`seed:<domain>` 标记，只表示某个数据域的初始内容写过没有，不阻止库打开；
 * 4. 应用清单版本（ADESK-US-205）——只管 `/Applications` 的 `.app` 投影是否补齐，不阻止库打开。
 *
 * **升级清单**：新增实体或数据域，必须同时 ① 补建表（实体登记进 `entities.ts`，RxDB 在连接时补建）、
 * ② 补种子（`seeds.ts`）、③ 把 {@link DESKTOP_SCHEMA_VERSION} 加一并在 {@link SCHEMA_STEPS} 登记一行、
 * ④ 更新 `schema-fingerprint.snapshot.json`。`schema-fingerprint.spec.ts` 在实体或数据域变了而版本没升时失败。
 * 既有实体的字段变了，除上面几步还要在该行写 `migrate`；没有 `migrate` 的版本只能是「只增不改」。
 */

/**
 * 当前构建的 schema 版本。取 `YYYYMMDDNN`（日期加当天序号）的十位整数，单调递增，一眼能对上提交日期；
 * 构建产物里最大的十位版本字面量是当前版本，升级验收（ADESK-US-106 的冒烟）靠它改写出「更新的构建」。
 * **改这个常量是一次单向操作**：升过的库，没有降级保护的旧构建会直接打开，所以每次升版本都进发布说明。
 */
export const DESKTOP_SCHEMA_VERSION = 2026112601;

/** 版本记录在系统偏好表里的键。 */
export const SCHEMA_RECORD_KEY = 'schema:desktop';

/** 库里的版本记录。 */
export interface SchemaRecord {
  /** 写入时的 schema 版本。 */
  readonly version: number;
  /** 写入这条记录的构建标识；没有构建标识时为空串。 */
  readonly build: string;
  /** 写入时刻（毫秒时间戳）。 */
  readonly upgradedAt: number;
}

export function isSchemaRecord(value: unknown): value is SchemaRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<Record<keyof SchemaRecord, unknown>>;
  return (
    Number.isInteger(record.version) &&
    (record.version as number) > 0 &&
    typeof record.build === 'string' &&
    typeof record.upgradedAt === 'number'
  );
}

/** 升级到某个版本要做的事。 */
export interface SchemaStep {
  /** 这一步把库带到的 schema 版本。 */
  readonly version: number;
  /** 做了什么、为什么（进发布说明）。 */
  readonly summary: string;
  /**
   * 既有实体的字段或数据约定变了时写迁移；与写入版本记录同一个事务（全有或全无）。
   * 只增不改（新实体、新数据域）的版本不写它，建表与种子由 RxDB 连接与按域种子补齐。
   */
  readonly migrate?: (executor: SchemaExecutor) => Promise<void>;
}

/** 迁移步骤用的事务句柄：只暴露迁移需要的最小面，便于单测里用假实现。 */
export interface SchemaExecutor {
  /** 在升级事务里执行一条 SQL。 */
  execute(sql: string, bindings?: readonly (string | number | null)[]): Promise<unknown>;
  /** 在同一事务中迁移既有实体数据。 */
  getRepository: TransactionExecutor['getRepository'];
}

/** 升级清单：按版本升序，每次升 schema 版本追加一行，不改已发布的行。 */
export const SCHEMA_STEPS: readonly SchemaStep[] = [
  {
    version: 2026111301,
    summary:
      '首个带版本记录的构建。此前发布的构建建的库没有版本记录，视为版本 0；新增的实体表由 RxDB 在连接时补建，' +
      '新数据域按 seed:<domain> 标记补种子，已有内容不被覆盖。'
  },
  {
    version: 2026111701,
    summary: '文件行新增 original_path，废纸篓恢复原位置与移动在同一行提交；旧废纸篓条目由用户选择恢复目录。',
    migrate: async executor => {
      const result = (await executor.execute('PRAGMA table_info("desktop$desktop_file")')) as RawQueryResult;
      const name = result.columns.indexOf('name');
      if (!result.rows.some(row => row[name] === 'original_path'))
        await executor.execute('ALTER TABLE "desktop$desktop_file" ADD COLUMN "original_path" TEXT');
    }
  },
  {
    version: 2026111702,
    summary: '引入文件批次中断日志和恢复代际写保护；旧构建必须停止写入，避免清理未完成批次时删除旧页新写入的内容。'
  },
  {
    version: 2026111703,
    summary: '批准目录安装集与应用投影日志成为写入协议；阻止只认识静态预装清单的旧构建删除已安装应用包。'
  },
  {
    version: 2026111801,
    summary: '提醒事项新增 flagged 字段；旧库默认未标旗，新库按提醒种子写入标旗状态。',
    migrate: async executor => {
      const result = (await executor.execute('PRAGMA table_info("desktop$reminder")')) as RawQueryResult;
      const name = result.columns.indexOf('name');
      if (!result.rows.some(row => row[name] === 'flagged'))
        await executor.execute('ALTER TABLE "desktop$reminder" ADD COLUMN "flagged" INTEGER NOT NULL DEFAULT 0');
    }
  },
  {
    version: 2026111802,
    summary: 'Notes 新增用户文件夹目录；旧库由 RxDB 补建空目录表，已有笔记和系统文件夹保持不变。'
  },
  {
    version: 2026112101,
    summary: '天气默认城市改为北京；旧库首次读取天气时只迁移仍是初始 Cupertino 的城市。'
  },
  {
    version: 2026112301,
    summary: '桌面短用户名统一为 stevejobs；旧库原地迁移主目录及其系统路径引用，保留文件体与仓库记录。',
    migrate: migrateDesktopHome
  },
  {
    version: 2026112601,
    summary: '界面语言偏好与目录实体（i18nEntities 四表）；旧库由 RxDB 连接时补建，无字段迁移。'
  }
];

/** 没有版本记录的库（此前发布的所有构建建的）视为这个最旧的版本。 */
export const LEGACY_SCHEMA_VERSION = 0;

/** 探测库得到的事实。 */
export interface SchemaProbe {
  /** 系统偏好表是否存在；不存在说明是全新的库（或从未成功初始化）。 */
  readonly hasPreferenceTable: boolean;
  /** 版本记录那一行的值（`undefined` 表示没有这一行）。 */
  readonly recordValue: unknown;
  /** 与当前实体声明相比缺少的表或列，形如 `note`、`note.title`。 */
  readonly missing: readonly string[];
}

/** 对一个库该怎么办。 */
export type SchemaPlan =
  | { readonly kind: 'fresh' }
  | { readonly kind: 'current' }
  | { readonly kind: 'upgrade'; readonly from: number }
  | { readonly kind: 'too-new'; readonly found: number }
  | { readonly kind: 'corrupt'; readonly reason: string; readonly missing: readonly string[] }
  | { readonly kind: 'incompatible'; readonly from: number };

/**
 * 判定：全新、已是当前、需要升级、比当前构建更新（降级保护）、损坏，或没有迁移路径。
 *
 * - 没有系统偏好表 → 全新的库；
 * - 有表没有版本记录行 → 此前发布的构建建的库，视为版本 0，走升级（补建、补种子、写记录），**不按损坏处理**；
 * - 记录存在却无法解析 → 损坏，不猜；
 * - 记录高于当前构建 → 降级保护：拒绝打开、不写库；
 * - 记录等于当前但结构不符（缺表、缺列）→ 损坏，不静默修补；
 * - 记录低于当前 → 升级；起点不在升级清单里（也不是 0）→ 没有迁移路径，按不兼容处理。
 *
 * @param probe 探测到的事实
 * @param current 当前构建的版本，默认 {@link DESKTOP_SCHEMA_VERSION}
 * @param steps 升级清单，默认 {@link SCHEMA_STEPS}
 */
export function planSchema(
  probe: SchemaProbe,
  current: number = DESKTOP_SCHEMA_VERSION,
  steps: readonly SchemaStep[] = SCHEMA_STEPS
): SchemaPlan {
  if (!probe.hasPreferenceTable) return { kind: 'fresh' };
  if (probe.recordValue === undefined) return { kind: 'upgrade', from: LEGACY_SCHEMA_VERSION };
  if (!isSchemaRecord(probe.recordValue)) return { kind: 'corrupt', reason: '库里的版本记录无法解析', missing: [] };
  const found = probe.recordValue.version;
  if (found > current) return { kind: 'too-new', found };
  if (found === current) {
    return probe.missing.length ?
        { kind: 'corrupt', reason: '库的版本与当前构建一致，但结构缺少应有的表或列', missing: probe.missing }
      : { kind: 'current' };
  }
  const known = steps.some(step => step.version === found);
  return known ? { kind: 'upgrade', from: found } : { kind: 'incompatible', from: found };
}

/** 从 `from`（不含）升到 `to`（含）要走的步骤，按版本升序。 */
export function stepsBetween(
  from: number,
  to: number = DESKTOP_SCHEMA_VERSION,
  steps: readonly SchemaStep[] = SCHEMA_STEPS
): SchemaStep[] {
  return steps.filter(step => step.version > from && step.version <= to).sort((a, b) => a.version - b.version);
}

/** 在同一个事务中完成迁移，再写下新的版本记录。 */
export interface SchemaUpgradeTarget extends SchemaExecutor {
  /** 写入（新建或覆盖）版本记录。 */
  writeRecord(record: SchemaRecord): Promise<void>;
}

/**
 * 升级：按版本升序执行 `from` 之后的迁移步骤，**最后**才写版本记录。调用方把它放在一个数据库事务里，
 * 所以任何一步失败，记录都不会推进，库回到升级前；整个事务提交了，库就是升级后的完整状态。
 * 只增不改的版本没有 `migrate`，这里只剩写记录。
 *
 * @param from 库当前的版本（没有版本记录的旧库为 0）
 * @param target 对库的写入面
 * @param now 取当前时间，单测里换成固定值
 * @param steps 升级清单，默认 {@link SCHEMA_STEPS}
 * @param current 当前构建的版本，默认 {@link DESKTOP_SCHEMA_VERSION}
 */
export async function runUpgrade(
  from: number,
  target: SchemaUpgradeTarget,
  now: () => number = Date.now,
  steps: readonly SchemaStep[] = SCHEMA_STEPS,
  current: number = DESKTOP_SCHEMA_VERSION
): Promise<void> {
  for (const step of stepsBetween(from, current, steps)) await step.migrate?.(target);
  await target.writeRecord({ version: current, build: '', upgradedAt: now() });
}
