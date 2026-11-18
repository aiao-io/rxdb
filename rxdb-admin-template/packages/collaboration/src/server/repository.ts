import type { Pool, PoolClient } from 'pg';
import { uuidv7 } from '../commit.js';
import { CollaborationError, demand, type Command, type Commit, type Identity, type Workspace } from '../model.js';
import { unavailable, unavailableReason } from './availability.js';
import { bootstrap, type EngineOptions } from './engine.js';
import { PgCommitStore } from './pg-store.js';
import { PgWorkspaceLoader, PgWorkspaceWriter, type Queryable } from './pg-workspace.js';
import { RetryCommand } from './scope.js';
import { runCommand } from './service.js';
import type { CommandStore } from './store.js';

/** 服务端生成的标识（审计事件、候选、合并提交等）一律用 UUIDv7，按生成时间有序。 */
const newId = () => uuidv7();
/** 一条命令最多执行的次数：遇到需要重来的并发情形（见 {@link retryable}）时回滚并从头再试。 */
const attempts = 4;
/**
 * 可以整体重试的失败：加锁后发现需要的行集合变了（{@link RetryCommand}），或数据库报告的并发冲突——
 * 死锁（40P01）、序列化失败（40001）、并发插入同一主键（23505，例如两条请求同时建同 ID 的任务、或复用同一个操作 ID）。
 * 重试从头加载，第二次就会看到对方已提交的结果，按正常的业务规则裁决（例如「已存在」或原回执）。
 */
function retryable(error: unknown): boolean {
  if (error instanceof RetryCommand) return true;
  if (error instanceof CollaborationError || !(error instanceof Error)) return false;
  const code = (error as Error & { code?: unknown }).code;
  return code === '40P01' || code === '40001' || code === '23505';
}
/**
 * 每个事务的时限，与事务一起开启（`SET LOCAL`，随事务结束失效）：Supavisor / PgBouncer 的 transaction 模式下连接不保留会话状态，
 * 也不转发 statement_timeout 之类的启动参数，所以不靠会话级设置。等锁超过 10 秒、单条语句超过 30 秒、事务中途空闲超过 15 秒
 * （例如入口进程在事务中途被平台终止）都会让数据库回滚这个事务，命令按「暂时不可用」返回，客户端稍后用原幂等键重发。
 */
export const transactionLimits = { statementTimeoutMs: 30_000, lockTimeoutMs: 10_000, idleTimeoutMs: 15_000 };
/** 开启命令事务并设置时限：一条简单查询，与单独的 BEGIN 同样只有一次往返。 */
const begin = [
  'BEGIN',
  `SET LOCAL statement_timeout = ${transactionLimits.statementTimeoutMs}`,
  `SET LOCAL lock_timeout = ${transactionLimits.lockTimeoutMs}`,
  `SET LOCAL idle_in_transaction_session_timeout = ${transactionLimits.idleTimeoutMs}`
].join('; ');
/**
 * 重试用尽或不能重试的失败交给调用方之前：连接池耗尽、连接中断、数据库超时与重试用尽的并发冲突转成可重试的 `unavailable`
 * （见 `availability.ts`，HTTP 层回 503 加 Retry-After），其余原样抛出。
 */
function surfaced(error: unknown): unknown {
  if (error instanceof RetryCommand) return unavailable('conflict');
  const reason = unavailableReason(error);
  return reason ? unavailable(reason) : error;
}

/**
 * 协作数据的 PostgreSQL 仓储，只负责写：初始化与命令。工作区不是一行 JSONB：治理行、成员、策略、数据模式、任务与引用、PR、
 * 候选、审核、讨论、通知、邀请、回执与审计分表存放，命令只加载并锁定它涉及的行（锁顺序见 `scope.ts`），写回只改动差异，
 * 成本因此与工作区的历史长度无关；每条改变状态的命令在同一事务里经 Realtime 广播失效通知（见 `pg-workspace.ts`）。
 * 读取不经这里：浏览器经 Supabase 的只读投影读取，可见范围由投影的成员资格条件裁决（迁移 `202611170004_supabase_native.sql`）。
 * `options` 是部署入口注入引擎的扩展：`checks` 为特殊业务检查（见 `checks.ts` 的 `RecordCheck`），默认没有。
 */
export class CollaborationRepository {
  constructor(
    private readonly pool: Pool,
    private readonly options: EngineOptions = {}
  ) {}
  /**
   * 初始化工作区（可信服务端部署命令调用）：同一事务里建出治理行、第一版策略、初始管理员、第一个数据模式版本，
   * 以及共享分支的根（`baseline` 提交，共享头的初值）。参数与已有团队的稳定键一致时返回既有团队，
   * 不重置策略、权限与数据模式，也不再写根（新版本经 `schema` 命令登记）。
   */
  async initialize(input: Parameters<typeof bootstrap>[0]) {
    return this.transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        JSON.stringify([input.teamId, input.appId])
      ]);
      const previous = await client.query<{ name: string; bootstrap_key: string; initial_admin_id: string }>(
        'SELECT name, bootstrap_key, initial_admin_id FROM admin_private.workspaces WHERE team_id = $1 AND app_id = $2',
        [input.teamId, input.appId]
      );
      const existing = previous.rows[0];
      if (existing) {
        demand(
          existing.bootstrap_key === input.bootstrapKey &&
            existing.initial_admin_id === input.admin.id &&
            existing.name === input.name,
          'idempotency',
          '初始化参数与已有团队归属不一致'
        );
        return { teamId: input.teamId, appId: input.appId };
      }
      const { state, root } = bootstrap(input, { now: Date.now(), id: newId });
      await this.create(client, state, root);
      return { teamId: input.teamId, appId: input.appId };
    });
  }
  /**
   * 执行一条命令：命令只锁它涉及的行；遇到需要重来的并发情形时整体回滚并重试（最多 {@link attempts} 次）。
   * 连接池耗尽、连接中断、数据库超时以及重试用尽的并发冲突以 `unavailable` 抛出（可重试的明确错误），事务已整体回滚，
   * 客户端用同一个操作 ID 重发时按回执裁决，不会重复执行。
   */
  async operation(user: Identity, teamId: string, appId: string, command: Command) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.transaction(client => this.execute(client, user, teamId, appId, command));
      } catch (error) {
        if (attempt >= attempts || !retryable(error)) throw surfaced(error);
      }
    }
  }
  private async execute(client: PoolClient, user: Identity, teamId: string, appId: string, command: Command) {
    const writer = new PgWorkspaceWriter(client, teamId, appId);
    const store: CommandStore = {
      commits: new PgCommitStore(client, teamId, appId),
      loader: new PgWorkspaceLoader(client, teamId, appId),
      save: (changes, effects, at) => writer.save(changes, effects, at)
    };
    return runCommand(store, user, command, { now: Date.now(), id: newId }, this.options);
  }
  /**
   * 新建工作区的全部初始行：治理行、第一版策略、第一个数据模式版本、初始管理员、共享分支的根提交、指向根的共享引用与共享头投影、
   * 版本行（修订号 0、一条审计）和初始化审计事件，同一个事务里落地，任一步失败整体回滚。
   */
  private async create(client: Queryable, state: Workspace, root: Commit): Promise<void> {
    const scope = [state.teamId, state.appId];
    await client.query(
      `INSERT INTO admin_private.workspaces(team_id, app_id, name, bootstrap_key, initial_admin_id, schema_version, policy_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [...scope, state.name, state.bootstrapKey, state.initialAdminId, state.schemaVersion, state.policy.version]
    );
    await client.query('INSERT INTO admin_private.policies(team_id, app_id, version, stages) VALUES ($1, $2, $3, $4)', [
      ...scope,
      state.policy.version,
      JSON.stringify(state.policy.stages)
    ]);
    await client.query(
      'INSERT INTO admin_private.schemas(team_id, app_id, version, manifest) VALUES ($1, $2, $3, $4)',
      [...scope, state.schemaVersion, JSON.stringify(state.schema)]
    );
    for (const member of Object.values(state.members))
      await client.query(
        `INSERT INTO admin_private.memberships(team_id, app_id, user_id, email, permissions, generation, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [...scope, member.id, member.email, member.permissions, member.generation, member.active]
      );
    await new PgCommitStore(client, state.teamId, state.appId).append([{ record: root, candidateId: null }]);
    await client.query(`INSERT INTO admin_private.refs(team_id, app_id, ref, head) VALUES ($1, $2, 'shared', $3)`, [
      ...scope,
      root.commitId
    ]);
    await client.query('INSERT INTO public.admin_shared(team_id, app_id, head) VALUES ($1, $2, $3)', [
      ...scope,
      root.commitId
    ]);
    await client.query(
      'INSERT INTO public.admin_workspace_versions(team_id, app_id, revision, audit_count) VALUES ($1, $2, $3, $4)',
      [...scope, state.revision, state.audit.length]
    );
    for (const event of state.audit)
      await client.query(
        `INSERT INTO public.admin_audit(team_id, app_id, id, actor_id, action, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0))`,
        [...scope, event.id, event.actorId, event.action, event, event.at]
      );
  }
  /**
   * 在一个事务里执行 `work`：开启时设置时限（{@link transactionLimits}），失败时回滚。
   * 连接在借出期间被对端断开（例如 Supavisor / PgBouncer 排队超时后关闭连接）时，pg 在这个连接上发出 error 事件；
   * 借出期间连接池不替它监听，没有监听者的 error 事件会让 Node 进程或 Edge Function 的 worker 直接崩溃，所以这里接住它、
   * 把连接记为已损坏，归还时从连接池里销毁（回滚失败时同样处理）。抛出的仍是原始错误，由 {@link surfaced} 归类。
   */
  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let broken: Error | undefined;
    const lost = (error: Error) => {
      broken ??= error;
    };
    client.on('error', lost);
    try {
      await client.query(begin);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch((failure: unknown) => {
        broken = failure instanceof Error ? failure : new Error(String(failure));
      });
      throw error;
    } finally {
      client.off('error', lost);
      client.release(broken);
    }
  }
}
