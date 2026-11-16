import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { demand, type Command, type Identity, type Workspace } from '../model.js';
import { authorize } from './access.js';
import { bootstrap, execute, snapshot } from './engine.js';

/** 同一工作区的所有操作先锁相同行，授权与业务变更处于同一个裁决顺序。 */
export class CollaborationRepository {
  constructor(private readonly pool: Pool) {}
  async initialize(input: Parameters<typeof bootstrap>[0]) {
    return this.transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        JSON.stringify([input.teamId, input.appId])
      ]);
      const previous = await this.load(client, input.teamId, input.appId, false);
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
      const state = bootstrap(input, { now: Date.now(), id: randomUUID });
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
    return this.transaction(async client => snapshot(await this.required(client, teamId, appId), user, Date.now()));
  }
  async operation(user: Identity, teamId: string, appId: string, command: Command) {
    return this.transaction(async client => {
      const state = await this.required(client, teamId, appId);
      const previousRevision = state.revision;
      const result = execute(state, user, command, { now: Date.now(), id: randomUUID });
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
      const state = await this.required(client, teamId, appId);
      authorize(state, user, 'read');
      const receipt = state.receipts[operationId];
      demand(!receipt || receipt.actorId === user.id, 'forbidden', '无权读取此回执');
      return receipt ? { status: 'accepted', value: receipt.value } : { status: 'unknown' };
    });
  }
  private async load(client: PoolClient, teamId: string, appId: string, lock = true) {
    const result = await client.query<{ state: Workspace }>(
      `SELECT state FROM admin_private.workspaces WHERE team_id = $1 AND app_id = $2${lock ? ' FOR UPDATE' : ''}`,
      [teamId, appId]
    );
    return result.rows[0]?.state;
  }
  private async required(client: PoolClient, teamId: string, appId: string) {
    const state = await this.load(client, teamId, appId);
    demand(state, 'forbidden', '当前用户没有操作权限');
    return state;
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
    await client.query('DELETE FROM admin_private.memberships WHERE team_id = $1 AND app_id = $2', values);
    await client.query(
      `INSERT INTO admin_private.memberships(team_id, app_id, user_id, can_read)
      SELECT $1, $2, value->>'id', (value->>'active')::boolean AND (value->'permissions' ? 'read') FROM jsonb_each($3::jsonb)`,
      [...values, JSON.stringify(state.members)]
    );
    await client.query(
      `INSERT INTO public.admin_shared(team_id, app_id, head, records) VALUES ($1, $2, $3, $4)
      ON CONFLICT (team_id, app_id) DO UPDATE SET head = EXCLUDED.head, records = EXCLUDED.records
      WHERE admin_shared.head IS DISTINCT FROM EXCLUDED.head`,
      [...values, state.head, state.records]
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
  }
}
