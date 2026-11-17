import type { Pool, PoolClient } from 'pg';
import { uuidv7 } from '../commit.js';
import { CollaborationError, demand, type Command, type Identity, type Workspace } from '../model.js';
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
   * 初始化工作区（可信服务端部署命令调用）：同一事务里建出治理行、第一版策略、初始管理员与第一个数据模式版本。
   * 参数与已有团队的稳定键一致时返回既有团队，不重置策略、权限与数据模式（新版本经 `schema` 命令登记）。
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
      await this.create(client, bootstrap(input, { now: Date.now(), id: newId }));
      return { teamId: input.teamId, appId: input.appId };
    });
  }
  /** 执行一条命令：命令只锁它涉及的行；遇到需要重来的并发情形时整体回滚并重试（最多 {@link attempts} 次）。 */
  async operation(user: Identity, teamId: string, appId: string, command: Command) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.transaction(client => this.execute(client, user, teamId, appId, command));
      } catch (error) {
        if (attempt >= attempts || !retryable(error)) throw error;
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
   * 新建工作区的全部初始行：治理行、第一版策略、第一个数据模式版本、初始管理员、空的共享引用与共享头投影、
   * 版本行（修订号 0、一条审计）和初始化审计事件，同一个事务里落地，任一步失败整体回滚。
   */
  private async create(client: Queryable, state: Workspace): Promise<void> {
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
    await client.query(
      `INSERT INTO admin_private.refs(team_id, app_id, ref, head) VALUES ($1, $2, 'shared', NULL)`,
      scope
    );
    await client.query('INSERT INTO public.admin_shared(team_id, app_id, head) VALUES ($1, $2, NULL)', scope);
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
  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
