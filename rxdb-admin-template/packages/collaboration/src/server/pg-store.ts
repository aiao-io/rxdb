import type { PoolClient } from 'pg';
import {
  demand,
  type ChangeSet,
  type Commit,
  type CommitMeta,
  type CommitSummary,
  type DataRow,
  type Records
} from '../model.js';
import type { CommitStore, Lineage, Link, Path, SharedChange } from './store.js';

interface CommitRow {
  id: string;
  parent_id: string | null;
  author_id: string;
  message: string;
  merge_source: string | null;
  candidate_id: string | null;
  fingerprint: string;
}
interface LinkRow {
  id: string;
  parent_id: string | null;
  merge: boolean;
}
interface ChangeRow {
  commit_id: string;
  namespace: string;
  entity: DataRow['entity'];
  entity_id: string;
  operation: ChangeSet['operation'];
  patch: ChangeSet['patch'];
  inverse_patch: ChangeSet['inversePatch'];
}
interface SharedRow {
  record_id: string;
  entity: DataRow['entity'];
  fields: DataRow['fields'];
}

const summaryOf = (row: Omit<CommitRow, 'fingerprint'>): CommitSummary => {
  const summary: CommitSummary = { id: row.id, parent: row.parent_id, authorId: row.author_id, message: row.message };
  if (row.merge_source !== null) summary.mergeSource = row.merge_source;
  if (row.candidate_id !== null) summary.candidateId = row.candidate_id;
  return summary;
};
const metaOf = (row: CommitRow): CommitMeta => ({ ...summaryOf(row), fingerprint: row.fingerprint });

/**
 * 提交与共享记录的 PostgreSQL 存储，绑定一个团队下的一个应用与一个数据库连接，随该连接所在的事务读写：
 * 提交元数据在 `admin_private.commits`，字段级变更在 `admin_private.commit_changes`，
 * 共享记录按记录一行存在 `public.shared_records`。每个读取方法只发一条查询，范围由所问内容决定，
 * 沿父指针走图用递归查询，不会把整段历史读进来。
 */
export class PgCommitStore implements CommitStore {
  constructor(
    private readonly client: Pick<PoolClient, 'query'>,
    private readonly teamId: string,
    private readonly appId: string
  ) {}

  async commits(ids: readonly string[]): Promise<Map<string, CommitMeta>> {
    if (!ids.length) return new Map();
    const result = await this.client.query<CommitRow>(
      `SELECT id, parent_id, author_id, message, merge_source, candidate_id, fingerprint
       FROM admin_private.commits WHERE team_id = $1 AND app_id = $2 AND id = ANY($3::text[])`,
      [this.teamId, this.appId, [...ids]]
    );
    return new Map(result.rows.map(row => [row.id, metaOf(row)]));
  }
  async path(from: string | null, until: string | null): Promise<Path> {
    if (from === null || from === until) return { links: [], reached: from === until };
    const result = await this.client.query<LinkRow>(
      `WITH RECURSIVE chain AS (
         SELECT id, parent_id, merge_source IS NOT NULL AS merge FROM admin_private.commits
         WHERE team_id = $1 AND app_id = $2 AND id = $3 AND id IS DISTINCT FROM $4::text
         UNION
         SELECT c.id, c.parent_id, c.merge_source IS NOT NULL FROM chain
         JOIN admin_private.commits c ON c.team_id = $1 AND c.app_id = $2 AND c.id = chain.parent_id
         WHERE c.id IS DISTINCT FROM $4::text
       ) SELECT id, parent_id, merge FROM chain`,
      [this.teamId, this.appId, from, until]
    );
    const rows = new Map(result.rows.map(row => [row.id, row]));
    const links: Link[] = [];
    let cursor: string | null = from;
    while (cursor !== null && cursor !== until) {
      const row = rows.get(cursor);
      if (!row) return { links, reached: false };
      demand(links.length <= rows.size, 'ancestry', '提交图不能包含环');
      links.push({ id: row.id, parent: row.parent_id, merge: row.merge });
      cursor = row.parent_id;
    }
    return { links, reached: cursor === until };
  }
  async lineage(id: string): Promise<Lineage> {
    const result = await this.client.query<LinkRow>(
      `WITH RECURSIVE chain AS (
         SELECT id, parent_id, merge_source IS NOT NULL AS merge FROM admin_private.commits
         WHERE team_id = $1 AND app_id = $2 AND id = $3
         UNION
         SELECT c.id, c.parent_id, c.merge_source IS NOT NULL FROM chain
         JOIN admin_private.commits c ON c.team_id = $1 AND c.app_id = $2 AND c.id = chain.parent_id
         WHERE NOT chain.merge
       ) SELECT id, parent_id, merge FROM chain`,
      [this.teamId, this.appId, id]
    );
    const rows = new Map(result.rows.map(row => [row.id, row]));
    demand(rows.has(id), 'not_found', '提交不存在');
    const links: Link[] = [];
    let cursor: string | null = id;
    while (cursor !== null) {
      const row = rows.get(cursor);
      demand(row && links.length <= rows.size, 'ancestry', '提交图不能包含环');
      if (row.merge) return { links, anchor: row.id };
      links.push({ id: row.id, parent: row.parent_id, merge: false });
      cursor = row.parent_id;
    }
    return { links, anchor: null };
  }
  async changes(ids: readonly string[], records?: readonly string[]): Promise<Map<string, ChangeSet[]>> {
    const found = new Map<string, ChangeSet[]>();
    if (!ids.length) return found;
    const result = await this.client.query<ChangeRow>(
      `SELECT commit_id, namespace, entity, entity_id, operation, patch, inverse_patch
       FROM admin_private.commit_changes
       WHERE team_id = $1 AND app_id = $2 AND commit_id = ANY($3::text[])
         AND ($4::text[] IS NULL OR entity_id = ANY($4::text[]))
       ORDER BY commit_id, seq`,
      [this.teamId, this.appId, [...ids], records ? [...records] : null]
    );
    for (const row of result.rows) {
      const list = found.get(row.commit_id) ?? [];
      list.push({
        namespace: row.namespace,
        entity: row.entity,
        entityId: row.entity_id,
        operation: row.operation,
        patch: row.patch,
        inversePatch: row.inverse_patch
      });
      found.set(row.commit_id, list);
    }
    return found;
  }
  async shared(records?: readonly string[]): Promise<Records> {
    const result = await this.client.query<SharedRow>(
      `SELECT record_id, entity, fields FROM public.shared_records
       WHERE team_id = $1 AND app_id = $2 AND ($3::text[] IS NULL OR record_id = ANY($3::text[]))`,
      [this.teamId, this.appId, records ? [...records] : null]
    );
    const rows: Records = {};
    for (const row of result.rows) rows[row.record_id] = { entity: row.entity, fields: row.fields };
    return rows;
  }
  async summaries(): Promise<Record<string, CommitSummary>> {
    const result = await this.client.query<Omit<CommitRow, 'fingerprint'>>(
      `SELECT id, parent_id, author_id, message, merge_source, candidate_id
       FROM admin_private.commits WHERE team_id = $1 AND app_id = $2 ORDER BY seq`,
      [this.teamId, this.appId]
    );
    const found: Record<string, CommitSummary> = {};
    for (const row of result.rows) found[row.id] = summaryOf(row);
    return found;
  }
  async append(commits: readonly Commit[]): Promise<void> {
    if (!commits.length) return;
    const heads = commits.map((commit, ord) => ({
      ord,
      id: commit.id,
      parent: commit.parent,
      author: commit.authorId,
      message: commit.message,
      merge_source: commit.mergeSource ?? null,
      candidate_id: commit.candidateId ?? null,
      fingerprint: commit.fingerprint
    }));
    await this.client.query(
      `INSERT INTO admin_private.commits(team_id, app_id, id, parent_id, author_id, message, merge_source, candidate_id, fingerprint)
       SELECT $1, $2, x.id, x.parent, x.author, x.message, x.merge_source, x.candidate_id, x.fingerprint
       FROM jsonb_to_recordset($3::jsonb)
         AS x(ord int, id text, parent text, author text, message text, merge_source text, candidate_id text, fingerprint text)
       ORDER BY x.ord`,
      [this.teamId, this.appId, JSON.stringify(heads)]
    );
    const changes = commits.flatMap(commit =>
      commit.changes.map((change, seq) => ({
        commit_id: commit.id,
        seq,
        namespace: change.namespace,
        entity: change.entity,
        entity_id: change.entityId,
        operation: change.operation,
        patch: change.patch,
        inverse_patch: change.inversePatch
      }))
    );
    if (!changes.length) return;
    await this.client.query(
      `INSERT INTO admin_private.commit_changes(team_id, app_id, commit_id, seq, namespace, entity, entity_id, operation, patch, inverse_patch)
       SELECT $1, $2, x.commit_id, x.seq, x.namespace, x.entity, x.entity_id, x.operation,
         x.patch, x.inverse_patch
       FROM jsonb_to_recordset($3::jsonb)
         AS x(commit_id text, seq int, namespace text, entity text, entity_id text, operation text, patch jsonb, inverse_patch jsonb)`,
      [this.teamId, this.appId, JSON.stringify(changes)]
    );
  }
  async apply(change: SharedChange): Promise<void> {
    const rows = Object.entries(change.upsert).map(([id, row]) => ({
      record_id: id,
      entity: row.entity,
      fields: row.fields
    }));
    if (rows.length)
      await this.client.query(
        `INSERT INTO public.shared_records(team_id, app_id, record_id, entity, fields)
         SELECT $1, $2, x.record_id, x.entity, x.fields
         FROM jsonb_to_recordset($3::jsonb) AS x(record_id text, entity text, fields jsonb)
         ON CONFLICT (team_id, app_id, record_id) DO UPDATE SET entity = EXCLUDED.entity, fields = EXCLUDED.fields`,
        [this.teamId, this.appId, JSON.stringify(rows)]
      );
    if (change.remove.length)
      await this.client.query(
        'DELETE FROM public.shared_records WHERE team_id = $1 AND app_id = $2 AND record_id = ANY($3::text[])',
        [this.teamId, this.appId, change.remove]
      );
  }
}
