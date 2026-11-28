import { demand } from '../model.js';

/**
 * 审计归档（ADMIN-US-217 AC#6）：热表 `public.admin_audit` 里满足策略的事件由迁移所有者分批移入归档表
 * `admin_private.audit_archive`（迁移 `202611180003_audit_archive.sql` 的 `admin_private.archive_audit()`），
 * 只读投影 `public.admin_audit_events` 合并两张表，审计分页与最近一窗照常读得到归档的事件。
 * 策略二选一或同时给出，事件满足任一条件即归档：早于 {@link AuditArchivePolicy.afterDays} 天，
 * 或不在本工作区按写入顺序最新的 {@link AuditArchivePolicy.keepLatest} 条之内。
 * 由运维命令行执行（`nx run admin-collaboration:audit-archive`，见 `bootstrap.ts`），命令入口不参与。
 */
export interface AuditArchivePolicy {
  /** 早于多少天的事件归档；不按时间归档时为 null。 */
  afterDays: number | null;
  /** 每个工作区的热表只保留按写入顺序最新的多少条；不按条数归档时为 null。0 表示一条不留。 */
  keepLatest: number | null;
  /** 一次调用归档函数至多移动的行数：每批一个短事务，不长时间持有行锁。 */
  batch: number;
}
/** 每批默认移动的行数。 */
export const defaultArchiveBatch = 5000;

/** 三个设置的变量名：天数、每个工作区保留的条数与每批的行数。 */
const variables = {
  afterDays: 'ADMIN_AUDIT_ARCHIVE_AFTER_DAYS',
  keepLatest: 'ADMIN_AUDIT_KEEP_LATEST',
  batch: 'ADMIN_AUDIT_ARCHIVE_BATCH'
} as const;
/**
 * 各设置接受的十进制写法：天数 1～99999，保留条数 0～999999999（放得进 PostgreSQL 的 integer），每批 1～1000000。
 * 不接受前导零、空白、小数、指数与十六进制，写错的值不会被宽松地解读成别的数。
 */
const formats = {
  afterDays: /^[1-9]\d{0,4}$/,
  keepLatest: /^(0|[1-9]\d{0,8})$/,
  batch: /^([1-9]\d{0,5}|1000000)$/
} as const;

/** 读一个整数设置：没给（或为空串）时为 null，给了就必须符合格式；不合格时错误详情只带变量名（词条会随前端产物下发）。 */
function setting(env: Readonly<Record<string, string | undefined>>, key: keyof typeof variables): number | null {
  const value = env[variables[key]];
  if (value === undefined || value === '') return null;
  demand(formats[key].test(value), 'configuration', '审计归档策略的取值不合法', { variables: [variables[key]] });
  return Number(value);
}

/**
 * 从运维环境读取归档策略：`ADMIN_AUDIT_ARCHIVE_AFTER_DAYS`（正整数天数）与 `ADMIN_AUDIT_KEEP_LATEST`（非负整数）至少给一个，
 * `ADMIN_AUDIT_ARCHIVE_BATCH` 可选（默认 {@link defaultArchiveBatch}）。都没给或取值不合法时抛出配置错误，不归档任何事件。
 */
export function auditArchivePolicy(env: Readonly<Record<string, string | undefined>>): AuditArchivePolicy {
  const afterDays = setting(env, 'afterDays');
  const keepLatest = setting(env, 'keepLatest');
  demand(afterDays !== null || keepLatest !== null, 'configuration', '审计归档策略至少要按天数或按条数之一', {
    variables: [variables.afterDays, variables.keepLatest]
  });
  return { afterDays, keepLatest, batch: setting(env, 'batch') ?? defaultArchiveBatch };
}

/** 执行归档所需的数据库接口：迁移所有者的连接（`pg` 的 Pool 或 Client）。 */
export interface AuditArchiveDatabase {
  query(sql: string, params: unknown[]): Promise<{ rows: unknown[] }>;
}

/**
 * 按策略归档：反复调用 `admin_private.archive_audit()`，每次至多移动一批（按写入顺序从最旧的起），直到某一批不满为止，
 * 返回移动的总行数。每次调用是一个独立的短事务；中途失败时已完成的批次保留，重跑会从剩下的接着移（归档幂等）。
 */
export async function archiveAudit(database: AuditArchiveDatabase, policy: AuditArchivePolicy): Promise<number> {
  const params = [policy.afterDays === null ? null : `${policy.afterDays} days`, policy.keepLatest, policy.batch];
  let total = 0;
  for (;;) {
    const { rows } = await database.query(
      'SELECT admin_private.archive_audit($1::interval, $2::integer, $3::integer) AS moved',
      params
    );
    const moved = (rows[0] as { moved?: unknown } | undefined)?.moved;
    if (typeof moved !== 'number' || !Number.isSafeInteger(moved) || moved < 0)
      throw new Error('admin_private.archive_audit did not report how many events it moved');
    total += moved;
    if (moved < policy.batch) return total;
  }
}
