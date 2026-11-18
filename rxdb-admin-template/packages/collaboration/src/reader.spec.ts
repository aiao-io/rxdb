import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { readPageSize, supabaseReadSource, type Filter, type ReadSource, type RowQuery } from './read-source.js';
import { CollaborationReader } from './reader.js';

type Row = Record<string, unknown>;
const matches = (row: Row, where: Readonly<Record<string, Filter>>) =>
  Object.entries(where).every(([column, filter]) =>
    'eq' in filter ? row[column] === filter.eq
    : 'in' in filter ? filter.in.includes(String(row[column]))
    : Number(row[column]) < filter.lt
  );
/**
 * 内存里的只读投影：按与 PostgREST 相同的语义执行筛选、排序、偏移与条数上限（上限取 {@link readPageSize}），
 * 并记下每次查询，用来断言读取的顺序、范围与分页。读取函数按名字给出固定结果。
 */
function memorySource(tables: Record<string, Row[]>, functions: Record<string, (args: Row) => unknown> = {}) {
  const queries: { view: string; query: RowQuery | { count: Readonly<Record<string, Filter>> } }[] = [];
  const source: ReadSource = {
    async rows<T extends object>(view: string, query: RowQuery) {
      queries.push({ view, query });
      let rows = (tables[view] ?? []).filter(row => matches(row, query.where));
      for (const [column, direction] of [...(query.order ?? [])].reverse())
        rows = [...rows].sort((a, b) => {
          const order = String(a[column]).localeCompare(String(b[column]), 'en', { numeric: true });
          return direction === 'asc' ? order : -order;
        });
      const offset = query.offset ?? 0;
      const limit = Math.min(query.limit ?? readPageSize, readPageSize);
      return rows
        .slice(offset, offset + limit)
        .map(row => Object.fromEntries(query.columns.map(c => [c, row[c]]))) as T[];
    },
    async count(view, where) {
      queries.push({ view, query: { count: where } });
      return (tables[view] ?? []).filter(row => matches(row, where)).length;
    },
    async call<T>(fn: string, args: Readonly<Record<string, unknown>>) {
      queries.push({ view: fn, query: { columns: [], where: {} } });
      return (functions[fn]?.({ ...args }) ?? null) as T | null;
    }
  };
  return { source, queries };
}
const scope = { team_id: 'team', app_id: 'assets' };
const workspace = { teamId: 'team', appId: 'assets', name: 'Team' };
const workspaceRow = {
  ...scope,
  name: 'Team',
  schema_version: 1,
  policy_version: 2,
  policy_stages: [{ id: 'review', name: '审核', minimum: 1, reviewers: [], after: [] }],
  head: 'merge-1',
  revision: '12',
  audit_count: '40'
};
const member = (user: string, seq: number, permissions = ['read', 'review']) => ({
  ...scope,
  user_id: user,
  email: `${user}@example.test`,
  permissions,
  generation: 1,
  seq
});
const pr = (id: string, seq: number, task: string) => ({
  ...scope,
  id,
  task_id: task,
  author_id: 'alice',
  title: id,
  description: '',
  target: 'shared',
  status: 'review',
  revision: 1,
  candidate_id: null,
  subscribers: ['alice'],
  seq
});
const task = (id: string, seq: number, owner = 'alice') => ({
  ...scope,
  id,
  name: id,
  owner_id: owner,
  base: null,
  origin_task_id: null,
  head: `${id}-head`,
  seq
});

describe('团队页只读取团队页需要的元数据，窗口外的不读', () => {
  it('先读工作区行，再并行读成员、邀请、最近的 PR、本人最近的任务与通知，最后按标识补读 PR 的来源任务', async () => {
    const { source, queries } = memorySource({
      admin_workspaces: [workspaceRow],
      admin_members: [member('bob', 2), member('alice', 1, ['read', 'manage'])],
      admin_invitations: [],
      admin_prs: [pr('pr-1', 1, 'task-b'), pr('pr-2', 2, 'task-a'), pr('pr-3', 3, 'task-c')],
      admin_tasks: [task('task-a', 1), task('task-b', 2, 'bob'), task('task-c', 3, 'carol'), task('task-d', 4)],
      admin_notifications: [
        {
          ...scope,
          id: 'n1',
          user_id: 'alice',
          pr_id: 'pr-1',
          thread_id: null,
          candidate_id: null,
          read: true,
          at: 1,
          seq: 1
        },
        {
          ...scope,
          id: 'n2',
          user_id: 'alice',
          pr_id: 'pr-1',
          thread_id: null,
          candidate_id: null,
          read: false,
          at: 2,
          seq: 2
        },
        {
          ...scope,
          id: 'n3',
          user_id: 'alice',
          pr_id: 'pr-2',
          thread_id: null,
          candidate_id: null,
          read: false,
          at: 3,
          seq: 3
        }
      ]
    });
    const reader = new CollaborationReader(() => source);
    const team = await reader.team(workspace, 'alice', { prs: 2, tasks: 1, notices: 2, taskIds: ['task-a'] });
    expect(queries[0]).toMatchObject({ view: 'admin_workspaces', query: { where: { team_id: { eq: 'team' } } } });
    expect(team).toMatchObject({
      revision: 12,
      head: 'merge-1',
      schemaVersion: 1,
      auditCount: 40,
      policy: { version: 2, stages: [{ id: 'review' }] },
      earlier: { prs: true, tasks: true }
    });
    expect(team.members.map(m => m.id)).toEqual(['alice', 'bob']);
    expect(team.members.every(m => m.active)).toBe(true);
    expect(team.prs.map(p => p.id)).toEqual(['pr-2', 'pr-3']);
    // 本人最近一个任务 task-d，加上窗口里 PR 的来源任务与必须带上的 task-a；更早的本人任务与无关的任务不读
    expect(team.tasks.map(t => t.id)).toEqual(['task-a', 'task-c', 'task-d']);
    expect(team.notices).toEqual({
      notices: [expect.objectContaining({ id: 'n2' }), expect.objectContaining({ id: 'n3' })],
      earlier: true,
      unread: 2
    });
    const tasks = queries.filter(entry => entry.view === 'admin_tasks').map(entry => entry.query as RowQuery);
    expect(tasks[0].where).toMatchObject({ owner_id: { eq: 'alice' } });
    expect(tasks[1].where).toMatchObject({ id: { in: ['task-a', 'task-c'] } });
  });
  it('工作区行读不到（不是成员、被撤权或工作区不存在）即按无权访问处理', async () => {
    const reader = new CollaborationReader(() => memorySource({ admin_workspaces: [] }).source);
    await expect(
      reader.team(workspace, 'alice', { prs: 50, tasks: 50, notices: 50, taskIds: [] })
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(reader.version(workspace)).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('全量读取按页接着读，直到不足一页', async () => {
    const members = Array.from({ length: readPageSize + 3 }, (_, index) => member(`user-${index}`, index));
    const { source, queries } = memorySource({ admin_workspaces: [workspaceRow], admin_members: members });
    const reader = new CollaborationReader(() => source);
    const team = await reader.team(workspace, 'alice', { prs: 1, tasks: 1, notices: 1, taskIds: [] });
    expect(team.members).toHaveLength(readPageSize + 3);
    expect(
      queries.filter(entry => entry.view === 'admin_members').map(entry => (entry.query as RowQuery).offset)
    ).toEqual([0, readPageSize]);
  });
});

describe('PR 详情与内容推导', () => {
  it('读取一个 PR 的候选、审核与讨论，按审批规则推导阻塞意见与阶段进度', async () => {
    const candidate = {
      ...scope,
      id: 'cand',
      pr_id: 'pr',
      base: null,
      source: 's',
      target: 'merge-1',
      schema_version: 1,
      policy_version: 2,
      resolutions: [],
      conflicts: [],
      checks: [],
      actor_id: 'alice',
      at: 5,
      seq: 1
    };
    const review = (id: string, reviewer: string, decision: string, seq: number) => ({
      ...scope,
      id,
      pr_id: 'pr',
      reviewer_id: reviewer,
      source: 's',
      candidate_id: 'cand',
      stage_id: 'review',
      decision,
      generation: 1,
      revision: seq,
      reason: '',
      at: seq,
      dismissed_reviewer_id: null,
      seq
    });
    const { source } = memorySource({
      admin_candidates: [candidate],
      admin_reviews: [review('r1', 'bob', 'approve', 1), review('r2', 'carol', 'request_changes', 2)],
      admin_threads: [
        {
          ...scope,
          id: 't',
          pr_id: 'pr',
          candidate_id: 'cand',
          record_id: null,
          field: null,
          required: true,
          resolved: false,
          resolved_candidate_id: null,
          revision: 1,
          seq: 1
        }
      ],
      admin_comments: [
        {
          ...scope,
          id: 'c2',
          thread_id: 't',
          pr_id: 'pr',
          author_id: 'bob',
          body: 'Second',
          deleted: false,
          revision: 0,
          at: 2,
          seq: 2
        },
        {
          ...scope,
          id: 'c1',
          thread_id: 't',
          pr_id: 'pr',
          author_id: 'alice',
          body: 'First',
          deleted: false,
          revision: 0,
          at: 1,
          seq: 1
        }
      ]
    });
    const reader = new CollaborationReader(() => source);
    const members = [
      { id: 'alice', email: 'a', permissions: ['read', 'edit'] as const, generation: 1, active: true },
      { id: 'bob', email: 'b', permissions: ['read', 'review'] as const, generation: 1, active: true },
      { id: 'carol', email: 'c', permissions: ['read', 'review'] as const, generation: 1, active: true }
    ].map(item => ({ ...item, permissions: [...item.permissions] }));
    const detail = await reader.prDetail(
      workspace,
      {
        ...{ id: 'pr', taskId: 'task', authorId: 'alice', title: 'PR', description: '', target: 'shared' as const },
        status: 'review',
        revision: 2,
        candidateId: 'cand',
        subscribers: []
      },
      {
        members,
        policy: { version: 2, stages: [{ id: 'review', name: '审核', minimum: 1, reviewers: [], after: [] }] }
      }
    );
    expect(Object.keys(detail.candidates)).toEqual(['cand']);
    expect(detail.candidates['cand']).not.toHaveProperty('changes');
    expect(detail.threads[0].comments.map(c => c.body)).toEqual(['First', 'Second']);
    expect(detail.governance).toEqual({
      prId: 'pr',
      blockers: [expect.objectContaining({ id: 'r2', reviewerId: 'carol' })],
      stages: [{ id: 'review', name: '审核', minimum: 1, approved: 1, complete: true }]
    });
  });
  it('推导内容时核对共享头：服务端的共享头已不是手里的版本就按版本已变化拒绝，读取函数返回 NULL 即无权访问', async () => {
    const shared = vi.fn((args: Row) => ({
      head: 'merge-2',
      records: args['p_record_ids'] === null ? [{ record_id: 'a', entity: 'AssetCategory', fields: { name: 'A' } }] : []
    }));
    const reader = new CollaborationReader(() => memorySource({}, { admin_shared_records: shared }).source);
    await expect(reader.records(workspace, 'merge-1')).rejects.toMatchObject({ code: 'stale' });
    await expect(reader.records(workspace, 'merge-2')).resolves.toEqual({
      head: 'merge-2',
      records: { a: { entity: 'AssetCategory', fields: { name: 'A' } } }
    });
    const denied = new CollaborationReader(() => memorySource({}).source);
    await expect(denied.records(workspace, 'merge-1')).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('提交内容由提交图推导：合并提交取共享头反向应用其后的合并，任务提交在锚点上正向应用任务变更', async () => {
    // 共享分支：根 r → 合并 m1（第二父 s1）→ 合并 m2（第二父 s2）；任务提交 t1 从 m1 起步
    const commit = (id: string, parents: string[], kind: string, author: string | null, candidate: string | null) => ({
      ...scope,
      id,
      parent_ids: parents,
      kind,
      author_id: author,
      message: id,
      candidate_id: candidate,
      created_at: '2026-11-18T00:00:00.000Z'
    });
    const commits = [
      commit('r', [], 'baseline', null, null),
      commit('m1', ['r', 's1'], 'merge', 'alice', 'k1'),
      commit('m2', ['m1', 's2'], 'merge', 'alice', 'k2'),
      commit('t1', ['m1'], 'normal', 'bob', null)
    ];
    const links: Record<string, { id: string; parent_id: string | null; kind: string }> = {
      r: { id: 'r', parent_id: null, kind: 'baseline' },
      m1: { id: 'm1', parent_id: 'r', kind: 'merge' },
      m2: { id: 'm2', parent_id: 'm1', kind: 'merge' },
      t1: { id: 't1', parent_id: 'm1', kind: 'normal' }
    };
    const walk = (from: string, until: string | null) => {
      const rows = [];
      for (let cursor: string | null = from; cursor && cursor !== until; cursor = links[cursor].parent_id)
        rows.push(links[cursor]);
      return rows;
    };
    const unit = { unit_id: 'u', transaction_id: null, origin: 'local', sequence: 0 };
    const changes = [
      {
        ...unit,
        commit_id: 'm2',
        namespace: 'assets',
        entity: 'AssetCategory',
        entity_id: 'a',
        operation: 'update',
        patch: { name: 'A2' },
        inverse_patch: { name: 'A1' }
      },
      {
        ...unit,
        commit_id: 't1',
        namespace: 'assets',
        entity: 'AssetCategory',
        entity_id: 'b',
        operation: 'insert',
        patch: { name: 'B' },
        inverse_patch: null
      }
    ];
    const { source } = memorySource(
      { admin_commits: commits },
      {
        admin_shared_records: () => ({
          head: 'm2',
          records: [{ record_id: 'a', entity: 'AssetCategory', fields: { name: 'A2' } }]
        }),
        admin_commit_path: args => walk(String(args['p_from']), (args['p_until'] as string | null) ?? null),
        admin_commit_lineage: args => [links[String(args['p_id'])], links['m1']],
        admin_commit_changes: args =>
          changes.filter(change => (args['p_commit_ids'] as string[]).includes(change.commit_id))
      }
    );
    const reader = new CollaborationReader(() => source);
    const shared = { head: 'm2', root: 'r' };
    await expect(reader.commit(workspace, shared, 'm1')).resolves.toMatchObject({
      id: 'm1',
      parentIds: ['r', 's1'],
      kind: 'merge',
      candidateId: 'k1',
      changes: [],
      records: { a: { entity: 'AssetCategory', fields: { name: 'A1' } } }
    });
    await expect(reader.commit(workspace, shared, 't1')).resolves.toMatchObject({
      id: 't1',
      authorId: 'bob',
      records: {
        a: { entity: 'AssetCategory', fields: { name: 'A1' } },
        b: { entity: 'AssetCategory', fields: { name: 'B' } }
      }
    });
    // 根的内容是空记录，不沿共享分支回退
    await expect(reader.commit(workspace, shared, 'r')).resolves.toMatchObject({ kind: 'baseline', records: {} });
    await expect(reader.commit(workspace, shared, 'missing')).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('审计、回执与数据模式', () => {
  it('审计按写入顺序从新到旧分页，游标不存在返回 not_found；回执只区分读得到与读不到', async () => {
    const events = Array.from({ length: 5 }, (_, index) => ({
      ...scope,
      id: `e${index}`,
      seq: index + 1,
      pr_id: index % 2 ? 'pr' : null,
      thread_id: null,
      details: { id: `e${index}`, actorId: 'alice', action: 'reply', operationId: `o${index}`, at: index, details: {} }
    }));
    // 审计读含归档的投影 admin_audit_events（热表与归档表合在一起）；只读热表 admin_audit 会漏掉归档的事件
    const { source, queries } = memorySource({
      admin_audit_events: events,
      admin_audit: events.slice(3),
      admin_receipts: [{ ...scope, operation_id: 'mine', result: { head: 'h' } }]
    });
    const reader = new CollaborationReader(() => source);
    expect((await reader.recentAudit(workspace)).map(event => event.id)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4']);
    const first = await reader.audit(workspace, { limit: 2 });
    expect(first.events.map(event => event.id)).toEqual(['e4', 'e3']);
    const second = await reader.audit(workspace, { limit: 2, before: first.nextBefore! });
    expect(second.events.map(event => event.id)).toEqual(['e2', 'e1']);
    expect((await reader.audit(workspace, { prId: 'pr' })).events.map(event => event.id)).toEqual(['e3', 'e1']);
    await expect(reader.audit(workspace, { before: 'missing' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(reader.audit(workspace, { limit: 101 })).rejects.toMatchObject({ code: 'invalid' });
    expect(new Set(queries.filter(query => query.view.startsWith('admin_audit')).map(query => query.view))).toEqual(
      new Set(['admin_audit_events'])
    );
    await expect(reader.receipt(workspace, 'mine')).resolves.toEqual({ status: 'accepted', value: { head: 'h' } });
    await expect(reader.receipt(workspace, 'theirs')).resolves.toEqual({ status: 'unknown' });
    await expect(reader.schema(workspace, 1)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('PostgREST 读取来源', () => {
  /** 真的 supabase-js 客户端，拦下它发出的请求：断言查询怎样落到 PostgREST 的 URL 上。 */
  function postgrest(response: (request: Request) => Response) {
    const requests: Request[] = [];
    // 关掉 supabase-js 对暂时性失败（503 等）的自动退避重试，失败用例才不必等几秒；生产客户端保留重试
    const client = createClient('https://project.supabase.test', 'public-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { retry: false },
      global: {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          requests.push(request);
          return response(request);
        }
      }
    });
    return { source: supabaseReadSource(client), requests };
  }
  it('把筛选、排序、偏移、条数、计数与读取函数映射成 PostgREST 请求', async () => {
    const { source, requests } = postgrest(request =>
      request.method === 'HEAD' ?
        new Response(null, { status: 200, headers: { 'content-range': '0-0/7' } })
      : Response.json(request.url.includes('/rpc/') ? { head: null, records: [] } : [])
    );
    await source.rows('admin_prs', {
      columns: ['id', 'seq'],
      where: { team_id: { eq: 'team' }, id: { in: ['a', 'b'] }, seq: { lt: 9 } },
      order: [['seq', 'desc']],
      limit: 51
    });
    await source.rows('admin_members', {
      columns: ['user_id'],
      where: {},
      order: [['seq', 'asc']],
      offset: 500,
      limit: 500
    });
    await expect(source.count('admin_notifications', { read: { eq: false } })).resolves.toBe(7);
    await source.call('admin_shared_records', { p_team_id: 'team', p_app_id: 'assets', p_record_ids: null });
    const [rows, paged, count, call] = requests;
    expect(decodeURIComponent(new URL(rows.url).search)).toBe(
      '?select=id,seq&team_id=eq.team&id=in.(a,b)&seq=lt.9&order=seq.desc&limit=51'
    );
    expect(decodeURIComponent(new URL(paged.url).search)).toBe('?select=user_id&order=seq.asc&offset=500&limit=500');
    expect(count.method).toBe('HEAD');
    expect(count.headers.get('prefer')).toContain('count=exact');
    expect(new URL(call.url).pathname).toBe('/rest/v1/rpc/admin_shared_records');
    expect(await call.json()).toEqual({ p_team_id: 'team', p_app_id: 'assets', p_record_ids: null });
  });
  it('会话失效（401 或 JWT 错误）报 unauthenticated，其余失败报 unavailable，都不当作空结果', async () => {
    const statuses = [401, 400, 503];
    let index = 0;
    const { source } = postgrest(() => {
      const status = statuses[index++];
      return Response.json(
        { code: status === 400 ? 'PGRST303' : 'XX000', message: 'detail', details: null, hint: null },
        { status }
      );
    });
    const query = { columns: ['id'], where: {} };
    await expect(source.rows('admin_prs', query)).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(source.rows('admin_prs', query)).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(source.rows('admin_prs', query)).rejects.toMatchObject({ code: 'unavailable' });
  });
});
