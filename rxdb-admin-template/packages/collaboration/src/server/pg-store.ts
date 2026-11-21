import type { PoolClient } from 'pg';
import {
  changesOf,
  commitSummaryOf,
  lineageOf,
  pathOf,
  type ChangeRow,
  type CommitRow,
  type LinkRow
} from '../derive.js';
import type { ChangeUnit, CommitMeta, CommitSummary, DataRow, Records } from '../model.js';
import { recordKeyText, type RecordKey } from '../schema.js';
import type { NewCommit } from './plan.js';
import type { CommitStore, IndexedKey, Lineage, Path, SharedChange } from './store.js';

interface SharedRow {
  record_id: string;
  entity: string;
  fields: DataRow['fields'];
}

const metaOf = (row: CommitRow & { content_fingerprint: string }): CommitMeta => ({
  ...commitSummaryOf(row),
  contentFingerprint: row.content_fingerprint
});
/**
 * 提交元数据的列；`created_at` 按 `toISOString()` 的写法读出（UTC、毫秒），交换记录的时间因此逐字往返
 * （上传时只收四位年份，见 `commit.ts`）。与公开投影 `admin_commits` 同一组列。
 */
const commitColumns = `id, parent_ids, kind, author_id, message, candidate_id,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at`;

/** 键索引的列，与 `admin_private.record_keys` 一致。 */
const keyColumns = 'record_id text, kind text, entity text, field text, value text';
const keyRows = (keys: readonly IndexedKey[]) =>
  JSON.stringify(
    keys.map(key => ({
      record_id: key.recordId,
      kind: key.kind,
      entity: key.entity,
      field: key.field,
      value: key.value
    }))
  );

/**
 * 提交与共享记录的 PostgreSQL 存储，绑定一个团队下的一个应用与一个数据库连接，随该连接所在的事务读写：
 * 交换记录的元数据（有序的父、种类、消息、作者、时间、内容指纹，合并提交另带候选）在 `admin_private.commits`，
 * 单元在 `admin_private.commit_changes`，共享记录按记录一行存在 `public.shared_records`，
 * 它们的唯一键与外键在键索引 `admin_private.record_keys`。
 * 每个读取方法只发一条查询，范围由所问内容决定，沿第一父走图用递归查询，不会把整段历史读进来。
 */
export class PgCommitStore implements CommitStore {
  constructor(
    private readonly client: Pick<PoolClient, 'query'>,
    private readonly teamId: string,
    private readonly appId: string
  ) {}

  async commits(ids: readonly string[]): Promise<Map<string, CommitMeta>> {
    if (!ids.length) return new Map();
    const result = await this.client.query<CommitRow & { content_fingerprint: string }>(
      `SELECT ${commitColumns}, content_fingerprint
       FROM admin_private.commits WHERE team_id = $1 AND app_id = $2 AND id = ANY($3::text[])`,
      [this.teamId, this.appId, [...ids]]
    );
    return new Map(result.rows.map(row => [row.id, metaOf(row)]));
  }
  async path(from: string, until: string | null): Promise<Path> {
    if (from === until) return { links: [], reached: true };
    const result = await this.client.query<LinkRow>(
      `WITH RECURSIVE chain AS (
         SELECT id, first_parent AS parent_id, kind FROM admin_private.commits
         WHERE team_id = $1 AND app_id = $2 AND id = $3 AND id IS DISTINCT FROM $4::text
         UNION
         SELECT c.id, c.first_parent, c.kind FROM chain
         JOIN admin_private.commits c ON c.team_id = $1 AND c.app_id = $2 AND c.id = chain.parent_id
         WHERE c.id IS DISTINCT FROM $4::text
       ) SELECT id, parent_id, kind FROM chain`,
      [this.teamId, this.appId, from, until]
    );
    return pathOf(result.rows, from, until);
  }
  async history(from: string, until: string | null, limit: number): Promise<CommitSummary[]> {
    if (from === until || limit < 1) return [];
    const result = await this.client.query<CommitRow>(
      `WITH RECURSIVE chain AS (
         SELECT id, first_parent, 1 AS depth FROM admin_private.commits
         WHERE team_id = $1 AND app_id = $2 AND id = $3
         UNION ALL
         SELECT c.id, c.first_parent, chain.depth + 1 FROM chain
         JOIN admin_private.commits c ON c.team_id = $1 AND c.app_id = $2 AND c.id = chain.first_parent
         WHERE chain.depth < $5 AND c.id IS DISTINCT FROM $4::text
       ) SELECT ${commitColumns} FROM chain
       JOIN admin_private.commits USING (id) WHERE team_id = $1 AND app_id = $2 ORDER BY depth`,
      [this.teamId, this.appId, from, until, limit]
    );
    return result.rows.map(commitSummaryOf);
  }
  async lineage(id: string): Promise<Lineage> {
    const result = await this.client.query<LinkRow>(
      `WITH RECURSIVE chain AS (
         SELECT id, first_parent AS parent_id, kind FROM admin_private.commits
         WHERE team_id = $1 AND app_id = $2 AND id = $3
         UNION
         SELECT c.id, c.first_parent, c.kind FROM chain
         JOIN admin_private.commits c ON c.team_id = $1 AND c.app_id = $2 AND c.id = chain.parent_id
         WHERE chain.kind = 'normal'
       ) SELECT id, parent_id, kind FROM chain`,
      [this.teamId, this.appId, id]
    );
    return lineageOf(result.rows, id);
  }
  async changes(ids: readonly string[], records?: readonly string[]): Promise<Map<string, ChangeUnit[]>> {
    if (!ids.length) return new Map();
    const result = await this.client.query<ChangeRow>(
      `SELECT commit_id, sequence, unit_id, transaction_id, namespace, entity, entity_id, operation, patch,
         inverse_patch, origin
       FROM admin_private.commit_changes
       WHERE team_id = $1 AND app_id = $2 AND commit_id = ANY($3::text[])
         AND ($4::text[] IS NULL OR entity_id = ANY($4::text[]))
       ORDER BY commit_id, sequence`,
      [this.teamId, this.appId, [...ids], records ? [...records] : null]
    );
    return changesOf(result.rows);
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
  async holders(keys: readonly RecordKey[]): Promise<Map<string, string[]>> {
    const unique = keys.filter(key => key.kind === 'unique');
    const found = new Map(unique.map(key => [recordKeyText(key), [] as string[]]));
    if (!unique.length) return found;
    const result = await this.client.query<{ entity: string; field: string; value: string; record_id: string }>(
      `SELECT k.entity, k.field, k.value, k.record_id FROM admin_private.record_keys k
       JOIN unnest($3::text[], $4::text[], $5::text[]) AS q(entity, field, value)
         ON k.entity = q.entity AND k.field = q.field AND k.value = q.value
       WHERE k.team_id = $1 AND k.app_id = $2 AND k.kind = 'unique'
       ORDER BY k.record_id`,
      [
        this.teamId,
        this.appId,
        unique.map(key => key.entity),
        unique.map(key => key.field),
        unique.map(key => key.value)
      ]
    );
    for (const row of result.rows)
      found
        .get(recordKeyText({ kind: 'unique', entity: row.entity, field: row.field, value: row.value }))
        ?.push(row.record_id);
    return found;
  }
  async referencing(ids: readonly string[]): Promise<Records> {
    if (!ids.length) return {};
    const result = await this.client.query<SharedRow>(
      `SELECT s.record_id, s.entity, s.fields FROM public.shared_records s
       WHERE s.team_id = $1 AND s.app_id = $2 AND s.record_id IN (
         SELECT k.record_id FROM admin_private.record_keys k
         WHERE k.team_id = $1 AND k.app_id = $2 AND k.kind = 'reference' AND k.value = ANY($3::text[]))`,
      [this.teamId, this.appId, [...ids]]
    );
    const rows: Records = {};
    for (const row of result.rows) rows[row.record_id] = { entity: row.entity, fields: row.fields };
    return rows;
  }
  async append(commits: readonly NewCommit[]): Promise<void> {
    if (!commits.length) return;
    const heads = commits.map(({ record, candidateId }, ord) => ({
      ord,
      id: record.commitId,
      parent_ids: record.parentIds,
      kind: record.kind,
      author_id: record.authorId,
      message: record.message,
      created_at: record.createdAt,
      content_fingerprint: record.contentFingerprint,
      candidate_id: candidateId
    }));
    // 按追加顺序插入：父外键要求祖先先于后代写入
    await this.client.query(
      `INSERT INTO admin_private.commits(team_id, app_id, id, parent_ids, kind, author_id, message, created_at,
         content_fingerprint, candidate_id)
       SELECT $1, $2, x.id, x.parent_ids, x.kind, x.author_id, x.message, x.created_at, x.content_fingerprint, x.candidate_id
       FROM jsonb_to_recordset($3::jsonb)
         AS x(ord int, id text, parent_ids text[], kind text, author_id text, message text, created_at timestamptz,
           content_fingerprint text, candidate_id text)
       ORDER BY x.ord`,
      [this.teamId, this.appId, JSON.stringify(heads)]
    );
    const units = commits.flatMap(({ record }) =>
      record.units.map((unit, sequence) => ({
        commit_id: record.commitId,
        sequence,
        unit_id: unit.unitId,
        transaction_id: unit.transactionId,
        namespace: unit.namespace,
        entity: unit.entity,
        entity_id: unit.entityId,
        operation: unit.operation,
        patch: unit.patch,
        inverse_patch: unit.inversePatch,
        origin: unit.origin
      }))
    );
    if (!units.length) return;
    await this.client.query(
      `INSERT INTO admin_private.commit_changes(team_id, app_id, commit_id, sequence, unit_id, transaction_id, namespace,
         entity, entity_id, operation, patch, inverse_patch, origin)
       SELECT $1, $2, x.commit_id, x.sequence, x.unit_id, x.transaction_id, x.namespace, x.entity, x.entity_id,
         x.operation, x.patch, x.inverse_patch, x.origin
       FROM jsonb_to_recordset($3::jsonb)
         AS x(commit_id text, sequence int, unit_id text, transaction_id text, namespace text, entity text,
           entity_id text, operation text, patch jsonb, inverse_patch jsonb, origin text)`,
      [this.teamId, this.appId, JSON.stringify(units)]
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
    // 删除的记录的键随外键级联删除；写入的记录先删旧键再写新键
    if (rows.length)
      await this.client.query(
        'DELETE FROM admin_private.record_keys WHERE team_id = $1 AND app_id = $2 AND record_id = ANY($3::text[])',
        [this.teamId, this.appId, rows.map(row => row.record_id)]
      );
    await this.insertKeys(change.keys);
  }
  async reindex(keys: readonly IndexedKey[]): Promise<void> {
    await this.client.query('DELETE FROM admin_private.record_keys WHERE team_id = $1 AND app_id = $2', [
      this.teamId,
      this.appId
    ]);
    await this.insertKeys(keys);
  }
  private async insertKeys(keys: readonly IndexedKey[]): Promise<void> {
    if (!keys.length) return;
    await this.client.query(
      `INSERT INTO admin_private.record_keys(team_id, app_id, record_id, kind, entity, field, value)
       SELECT $1, $2, x.record_id, x.kind, x.entity, x.field, x.value
       FROM jsonb_to_recordset($3::jsonb) AS x(${keyColumns})`,
      [this.teamId, this.appId, keyRows(keys)]
    );
  }
}
