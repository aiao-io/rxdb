import type { Pool, PoolClient } from 'pg';
import { uuidv7 } from '../commit.js';
import { demand, type AuditQuery, type Command, type Identity, type Presence, type Workspace } from '../model.js';
import { authorize } from './access.js';
import { auditPage, bootstrap } from './engine.js';
import { PgCommitStore } from './pg-store.js';
import { readCandidate, readCommit, readSharedRecords, readSummary, runCommand } from './service.js';
import type { CommitStore } from './store.js';

/** 读取工作区行时的锁：命令排他、Presence 共享、只读查询不加锁。 */
type RowLock = 'update' | 'share' | 'none';
const rowLockClause: Record<RowLock, string> = { update: ' FOR UPDATE', share: ' FOR SHARE', none: '' };

/** 服务端生成的标识（审计事件、候选、合并提交等）一律用 UUIDv7，按生成时间有序。 */
const newId = () => uuidv7();

/**
 * 同一工作区的所有操作先锁相同行，授权与业务变更处于同一个裁决顺序。
 * 工作区行只存成员、任务、PR、审核、讨论、回执与审计；提交与字段级变更在提交表，共享记录按记录一行，
 * 命令只读写它涉及的那部分，成本不随提交总数增长。
 */
export class CollaborationRepository {
  constructor(private readonly pool: Pool) {}
  async initialize(input: Parameters<typeof bootstrap>[0]) {
    return this.transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        JSON.stringify([input.teamId, input.appId])
      ]);
      const previous = await this.load(client, input.teamId, input.appId, 'none');
      if (previous) {
        demand(
          previous.bootstrapKey === input.bootstrapKey &&
            previous.initialAdminId === input.admin.id &&
            previous.name === input.name,
          'idempotency',
          '初始化参数与已有团队归属不一致'
        );
        return { teamId: previous.teamId, appId: previous.appId };
      }
      const state = bootstrap(input, { now: Date.now(), id: newId });
      await client.query('INSERT INTO admin_private.workspaces(team_id, app_id, state) VALUES ($1, $2, $3)', [
        state.teamId,
        state.appId,
        state
      ]);
      await this.project(client, state);
      return { teamId: state.teamId, appId: state.appId };
    });
  }
  async list(user: Identity) {
    const result = await this.pool.query<{ state: Workspace }>(
      "SELECT state FROM admin_private.workspaces WHERE state->'members'->$1->>'active' = 'true'",
      [user.id]
    );
    return result.rows
      .filter(({ state }) => state.members[user.id]?.permissions.includes('read'))
      .map(({ state }) => ({ teamId: state.teamId, appId: state.appId, name: state.name }));
  }
  async read(user: Identity, teamId: string, appId: string) {
    return this.view(teamId, appId, async (state, client, store) => {
      const now = Date.now();
      return readSummary(store, state, user, now, await this.readPresence(client, teamId, appId, now));
    });
  }
  /** 共享分支当前的全部记录与头提交；基于同一份已提交快照，不加锁、不写库。 */
  async readRecords(user: Identity, teamId: string, appId: string) {
    return this.view(teamId, appId, (state, _client, store) => readSharedRecords(store, state, user));
  }
  /** 一个提交的完整内容（由变更推导的整份记录）；不加锁、不写库，未知 ID 返回 `not_found`。 */
  async readCommit(user: Identity, teamId: string, appId: string, id: string) {
    return this.view(teamId, appId, (state, _client, store) => readCommit(store, state, user, id));
  }
  /** 一个合并候选的完整内容（由目标版本加存储的变更推导）；不加锁、不写库，未知 ID 返回 `not_found`。 */
  async readCandidate(user: Identity, teamId: string, appId: string, id: string) {
    return this.view(teamId, appId, (state, _client, store) => readCandidate(store, state, user, id));
  }
  /** 审计分页（新到旧）；不加锁、不写库。 */
  async readAudit(user: Identity, teamId: string, appId: string, query: AuditQuery) {
    return this.view(teamId, appId, state => Promise.resolve(auditPage(state, user, query)));
  }
  async operation(user: Identity, teamId: string, appId: string, command: Command) {
    return this.transaction(async client => {
      const store = new PgCommitStore(client, teamId, appId);
      if (command.type === 'presence') return this.updatePresence(client, store, user, teamId, appId, command);
      const state = await this.required(client, teamId, appId);
      const previousRevision = state.revision;
      const result = await runCommand(store, state, user, command, { now: Date.now(), id: newId });
      if (state.revision === previousRevision) return result;
      await client.query('UPDATE admin_private.workspaces SET state = $3 WHERE team_id = $1 AND app_id = $2', [
        teamId,
        appId,
        state
      ]);
      await this.project(client, state);
      return result;
    });
  }
  async receipt(user: Identity, teamId: string, appId: string, operationId: string) {
    return this.transaction(async client => {
      const state = await this.required(client, teamId, appId, 'none');
      authorize(state, user, 'read');
      const receipt = state.receipts[operationId];
      demand(!receipt || receipt.actorId === user.id, 'forbidden', '无权读取此回执');
      return receipt ? { status: 'accepted', value: receipt.value } : { status: 'unknown' };
    });
  }
  /**
   * 读取工作区状态。命令用排他锁串行裁决；Presence 只需按已提交的成员关系授权，用共享锁等待进行中的
   * 成员变更、但不与其他读者互斥；摘要、回执与按需内容读取基于已提交版本，不加锁，不会排在写事务后面。
   */
  private async load(client: PoolClient, teamId: string, appId: string, lock: RowLock = 'update') {
    const result = await client.query<{ state: Workspace }>(
      `SELECT state FROM admin_private.workspaces WHERE team_id = $1 AND app_id = $2${rowLockClause[lock]}`,
      [teamId, appId]
    );
    return result.rows[0]?.state;
  }
  /**
   * 只读查询：在一个只读的可重复读事务里完成，状态、提交与共享记录取自同一份已提交快照（合并同事务更新它们，
   * 读者不会看到合并到一半）；不加行锁、不写库，不会排在写事务后面。
   */
  private async view<T>(
    teamId: string,
    appId: string,
    read: (state: Workspace, client: PoolClient, store: CommitStore) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        const state = await this.required(client, teamId, appId, 'none');
        return await read(state, client, new PgCommitStore(client, teamId, appId));
      } finally {
        await client.query('ROLLBACK');
      }
    } finally {
      client.release();
    }
  }
  private async required(client: PoolClient, teamId: string, appId: string, lock: RowLock = 'update') {
    const state = await this.load(client, teamId, appId, lock);
    demand(state, 'forbidden', '当前用户没有操作权限');
    return state;
  }
  private async updatePresence(
    client: PoolClient,
    store: CommitStore,
    user: Identity,
    teamId: string,
    appId: string,
    command: Extract<Command, { type: 'presence' }>
  ): Promise<Record<string, unknown>> {
    const state = await this.required(client, teamId, appId, 'share');
    const now = Date.now();
    const result = await runCommand(store, state, user, command, { now, id: newId });
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
    } else {
      await client.query(
        `INSERT INTO public.admin_presence(team_id, app_id, user_id, session_id, pr_id, record_id, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (team_id, app_id, user_id, session_id)
         DO UPDATE SET pr_id = EXCLUDED.pr_id, record_id = EXCLUDED.record_id, expires_at = EXCLUDED.expires_at`,
        [teamId, appId, user.id, command.sessionId, command.prId, command.recordId, result['expiresAt']]
      );
    }
    return result;
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
  private async project(client: PoolClient, state: Workspace) {
    const values = [state.teamId, state.appId];
    await client.query(
      `INSERT INTO public.admin_workspace_versions(team_id, app_id, revision) VALUES ($1, $2, $3)
      ON CONFLICT (team_id, app_id) DO UPDATE SET revision = EXCLUDED.revision`,
      [...values, state.revision]
    );
    await client.query('DELETE FROM admin_private.memberships WHERE team_id = $1 AND app_id = $2', values);
    await client.query(
      `INSERT INTO admin_private.memberships(team_id, app_id, user_id, can_read)
      SELECT $1, $2, value->>'id', (value->>'active')::boolean AND (value->'permissions' ? 'read') FROM jsonb_each($3::jsonb)`,
      [...values, JSON.stringify(state.members)]
    );
    await client.query(
      `INSERT INTO public.admin_shared(team_id, app_id, head) VALUES ($1, $2, $3)
      ON CONFLICT (team_id, app_id) DO UPDATE SET head = EXCLUDED.head
      WHERE admin_shared.head IS DISTINCT FROM EXCLUDED.head`,
      [...values, state.head]
    );
    await client.query(
      `INSERT INTO public.admin_changes(team_id, app_id, merge_id, record_id, before_data, after_data)
      SELECT $1, $2, event->'details'->'result'->>'head', change->>'id', change->'before', change->'after'
      FROM jsonb_array_elements($3::jsonb) event, jsonb_array_elements(COALESCE(event->'details'->'result'->'changes', '[]'::jsonb)) change
      WHERE event->>'action' = 'merge' ON CONFLICT DO NOTHING`,
      [...values, JSON.stringify(state.audit)]
    );
    await client.query(
      `INSERT INTO public.admin_audit(team_id, app_id, id, actor_id, action, details, created_at)
      SELECT $1, $2, value->>'id', value->>'actorId', value->>'action', value, to_timestamp((value->>'at')::double precision / 1000)
      FROM jsonb_array_elements($3::jsonb) ON CONFLICT DO NOTHING`,
      [...values, JSON.stringify(state.audit)]
    );
    await client.query(
      `DELETE FROM public.admin_presence p
       WHERE p.team_id = $1 AND p.app_id = $2
         AND NOT EXISTS (
           SELECT 1
           FROM jsonb_each($3::jsonb) member
           WHERE member.key = p.user_id
             AND (member.value->>'active')::boolean
             AND member.value->'permissions' ? 'read'
         )`,
      [...values, JSON.stringify(state.members)]
    );
  }
}
