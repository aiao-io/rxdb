import type { Pool, PoolClient } from 'pg';
import { uuidv7 } from '../commit.js';
import {
  CollaborationError,
  demand,
  type AuditQuery,
  type Command,
  type HistoryQuery,
  type Identity,
  type Presence,
  type Workspace
} from '../model.js';
import { authorize } from './access.js';
import { bootstrap, type EngineOptions } from './engine.js';
import { PgCommitStore } from './pg-store.js';
import { PgWorkspaceLoader, PgWorkspaceReader, PgWorkspaceWriter, type Queryable } from './pg-workspace.js';
import { RetryCommand } from './scope.js';
import {
  readCandidate,
  readCommit,
  readHistory,
  readSchema,
  readSharedRecords,
  readSummary,
  runCommand
} from './service.js';
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
 * 协作数据的 PostgreSQL 仓储。工作区不再是一行 JSONB：治理行、成员、策略、数据模式、任务与引用、PR、候选、审核、讨论、通知、
 * 邀请、回执与审计分表存放，命令只加载并锁定它涉及的行（锁顺序见 `scope.ts`），写回只改动差异，
 * 成本因此与工作区的历史长度无关。读接口在只读快照里执行，不加锁、不写库。
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
  /** 「我的工作区」：按用户索引（memberships_user）读成员关系，不扫描其他团队的数据。 */
  async list(user: Identity) {
    const result = await this.pool.query<{ team_id: string; app_id: string; name: string }>(
      `SELECT w.team_id, w.app_id, w.name FROM admin_private.memberships m
       JOIN admin_private.workspaces w ON w.team_id = m.team_id AND w.app_id = m.app_id
       WHERE m.user_id = $1 AND m.can_read ORDER BY w.team_id, w.app_id`,
      [user.id]
    );
    return result.rows.map(row => ({ teamId: row.team_id, appId: row.app_id, name: row.name }));
  }
  async read(user: Identity, teamId: string, appId: string) {
    return this.view(teamId, appId, async (reader, client) => {
      authorize(reader.state, user, 'read');
      const { state, auditCount } = await reader.summary(user.id);
      const now = Date.now();
      return readSummary(state, user, now, {
        auditCount,
        presence: await this.readPresence(client, teamId, appId, now)
      });
    });
  }
  /** 共享分支当前的全部记录与头提交；基于同一份已提交快照，不加锁、不写库。 */
  async readRecords(user: Identity, teamId: string, appId: string) {
    return this.view(teamId, appId, (reader, client) =>
      readSharedRecords(new PgCommitStore(client, teamId, appId), reader.state, user)
    );
  }
  /** 一个提交的完整内容（自身的变更与推导出的整份记录）；不加锁、不写库，未知 ID 返回 `not_found`。 */
  async readCommit(user: Identity, teamId: string, appId: string, id: string) {
    return this.view(teamId, appId, (reader, client) =>
      readCommit(new PgCommitStore(client, teamId, appId), reader.state, user, id)
    );
  }
  /** 一个合并候选的完整内容（由目标版本加存储的变更推导）；不加锁、不写库，未知 ID 返回 `not_found`。 */
  async readCandidate(user: Identity, teamId: string, appId: string, id: string) {
    return this.view(teamId, appId, async (reader, client) => {
      authorize(reader.state, user, 'read');
      await reader.candidate(id);
      return readCandidate(new PgCommitStore(client, teamId, appId), reader.state, user, id);
    });
  }
  /** 提交历史的一页（共享分支、任务分支或 PR 的来源任务，从新到旧）；只沿父指针读本页，不加锁、不写库。 */
  async readHistory(user: Identity, teamId: string, appId: string, query: HistoryQuery) {
    return this.view(teamId, appId, async (reader, client) => {
      authorize(reader.state, user, 'read');
      if (query.taskId !== undefined) await reader.task(query.taskId, 'none');
      if (query.prId !== undefined) await reader.prWithTask(query.prId);
      return readHistory(new PgCommitStore(client, teamId, appId), reader.state, user, query);
    });
  }
  /** 按版本读取登记过的数据模式清单（只追加、不可修改）；不加锁、不写库，未登记的版本返回 `not_found`。 */
  async readSchema(user: Identity, teamId: string, appId: string, version: number) {
    return this.view(teamId, appId, reader => readSchema(found => reader.schema(found), reader.state, user, version));
  }
  /** 审计分页（新到旧），按写入顺序与登记的 PR / 线程归属在索引上分页；不加锁、不写库。 */
  async readAudit(user: Identity, teamId: string, appId: string, query: AuditQuery) {
    return this.view(teamId, appId, reader => {
      authorize(reader.state, user, 'read');
      return reader.auditPage(query);
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
  /** 幂等回执：只返回保留期内、属于当前用户的回执；不加锁、不写库。 */
  async receipt(user: Identity, teamId: string, appId: string, operationId: string) {
    return this.view(teamId, appId, async reader => {
      authorize(reader.state, user, 'read');
      const receipt = await reader.receiptRow(operationId, Date.now());
      demand(!receipt || receipt.actorId === user.id, 'forbidden', '无权读取此回执');
      return receipt ? { status: 'accepted', value: receipt.value } : { status: 'unknown' };
    });
  }
  private async execute(client: PoolClient, user: Identity, teamId: string, appId: string, command: Command) {
    const now = Date.now();
    const writer = new PgWorkspaceWriter(client, teamId, appId);
    const store: CommandStore = {
      commits: new PgCommitStore(client, teamId, appId),
      loader: new PgWorkspaceLoader(client, teamId, appId),
      save: (changes, effects, at) => writer.save(changes, effects, at)
    };
    const result = await runCommand(store, user, command, { now, id: newId }, this.options);
    if (command.type === 'presence') await this.writePresence(client, user, teamId, appId, command, result, now);
    return result;
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
  /**
   * 只读查询：在一个只读的可重复读事务里完成，治理行、成员、提交与共享记录取自同一份已提交快照（合并同事务更新它们，
   * 读者不会看到合并到一半）；不加行锁、不写库，不会排在写事务后面。工作区不存在时与无权访问同样拒绝。
   */
  private async view<T>(
    teamId: string,
    appId: string,
    read: (reader: PgWorkspaceReader, client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        const reader = new PgWorkspaceReader(client, teamId, appId);
        demand(await reader.open(), 'forbidden', '当前用户没有操作权限');
        return await read(reader, client);
      } finally {
        await client.query('ROLLBACK');
      }
    } finally {
      client.release();
    }
  }
  /** 在线状态写入：清掉过期会话，再写入或移除本会话；授权已由命令按治理行共享锁之后的成员关系裁决。 */
  private async writePresence(
    client: PoolClient,
    user: Identity,
    teamId: string,
    appId: string,
    command: Extract<Command, { type: 'presence' }>,
    result: Record<string, unknown>,
    now: number
  ): Promise<void> {
    await client.query('DELETE FROM public.admin_presence WHERE team_id = $1 AND app_id = $2 AND expires_at <= $3', [
      teamId,
      appId,
      now
    ]);
    if (command.leave) {
      await client.query(
        'DELETE FROM public.admin_presence WHERE team_id = $1 AND app_id = $2 AND user_id = $3 AND session_id = $4',
        [teamId, appId, user.id, command.sessionId]
      );
      return;
    }
    await client.query(
      `INSERT INTO public.admin_presence(team_id, app_id, user_id, session_id, pr_id, record_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (team_id, app_id, user_id, session_id)
       DO UPDATE SET pr_id = EXCLUDED.pr_id, record_id = EXCLUDED.record_id, expires_at = EXCLUDED.expires_at`,
      [teamId, appId, user.id, command.sessionId, command.prId, command.recordId, result['expiresAt']]
    );
  }
  /** 只读：过期会话由查询条件排除，清理留在 Presence 写入路径，读取不写库。 */
  private async readPresence(client: PoolClient, teamId: string, appId: string, now: number): Promise<Presence[]> {
    const result = await client.query<{
      user_id: string;
      session_id: string;
      pr_id: string | null;
      record_id: string | null;
      expires_at: string | number;
    }>(
      `SELECT user_id, session_id, pr_id, record_id, expires_at
       FROM public.admin_presence
       WHERE team_id = $1 AND app_id = $2 AND expires_at > $3`,
      [teamId, appId, now]
    );
    return result.rows.map(row => ({
      userId: row.user_id,
      sessionId: row.session_id,
      prId: row.pr_id,
      recordId: row.record_id,
      expiresAt: Number(row.expires_at)
    }));
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
