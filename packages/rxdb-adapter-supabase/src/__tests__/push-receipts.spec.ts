/**
 * @fileoverview US-218 阶段 B / C 真实链路：推送提交的被拒标记、水位线与幂等（T042、T052）
 *
 * 连本地真实 Supabase（`VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` 缺一即跳过，门控与同目录其它
 * 连远端 spec 一致）。用 `rls_todos`（真实 RLS 策略：SELECT 全放行，INSERT/UPDATE/DELETE 要求
 * `"createdBy" = auth.uid()::text`）而非 `todos`——后者没有 RLS，测不出 42501 被拒路径。
 *
 * 用 `auth.signUp` 注册两个随机用户 A、B（本地容器已开 autoconfirm，注册即拿到会话）。
 * 只有 B 建一个完整的 `RxDB` 实例（本地 wa-sqlite + 远端 Supabase，`{ client: userB.client }`）：
 * `@Entity` 装饰的实体类把 `save()` / `remove()` / `.get()` 绑在全局实体注册表上，同一进程里
 * 两个 `RxDB` 实例同时声明同一个实体会报错（`update-push-semantics.spec.ts` 里也有这条注释）。
 * A 的角色是「已经把数据推上去的另一个用户」，只用一个裸 `supabase-js` 会话直接写
 * `rls_todos`（命中 `rxdb_log_change_trigger`，自动落一条 `rxdb_change`，等价于 A 真的推送过），
 * 不需要也不能有自己的 `RxDB`/`RlsTodo` 实例。
 *
 * AC#13（不可归类 SQLSTATE 整批失败）额外用了 `rls_unique_probe` 夹具表 / `UniqueProbe`
 * 实体：`rls_todos` 的 INSERT/UPDATE 都经 `rxdb_batch_upsert` 的 `ON CONFLICT (id) DO
 * UPDATE`，同 id 重复插入天然幂等，造不出真正的 23505；`rls_unique_probe.uniqueSlug` 带独立
 * 于 `id` 的 UNIQUE 约束，才能撞出 `ON CONFLICT (id)` 盖不住的唯一键冲突。
 *
 * @remarks 覆盖范围
 * 推送仓库侧（data-model.md §7）：被拒源变更写 `rejectedAt` / `rejection`、`pushed` 只数 applied（AC#8、10）、
 * 被拒变更不再重推（AC#9）、被拒删除在本地对齐回远端值（AC#11）。适配器与参考 SQL 侧：同批重试幂等（AC#15）、
 * 不可归类 SQLSTATE 整批失败（AC#13），这两条直接调 `adapter.mergeChanges`，不经推送仓库。
 * - SC-009：记录单批 `mergeChanges` 耗时，无论 applied/rejected 混合批次都应 < 100 ms。
 */
import {
  compactChanges,
  Entity,
  EntityBase,
  getRxDBChangeEntityIdQueryValues,
  PropertyType,
  RxDB,
  RxDBChange,
  SyncType,
  type IRxDBChange,
  type UUID
} from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SupabaseDataError } from '../errors.js';
import { RxDBAdapterSupabase } from '../index.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
/** 宪法 IV 数据库操作预算（SC-009） */
const PUSH_BUDGET_MS = 100;

/**
 * `rls_todos` 的测试实体：列与 `Todo`/`todos` 一致，但远端表启用了真实 RLS 策略，
 * 用来验证被拒推送的真实链路（阶段 B 的 `todos` 没有 RLS，测不出 42501）。
 */
@Entity({
  name: 'RlsTodo',
  namespace: 'public',
  tableName: 'rls_todos',
  sync: {
    type: SyncType.Full,
    local: { adapter: 'local' },
    remote: { adapter: 'remote' }
  },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
class RlsTodo extends EntityBase {
  title!: string;
  completed!: boolean;
}

/**
 * AC#13 专用夹具实体：对应 `rls_unique_probe`（`uniqueSlug` 列带独立于 `id` 的 UNIQUE 约束）。
 *
 * @remarks
 * 不能复用 `RlsTodo`/`rls_todos` 来制造 23505——INSERT/UPDATE 都委托给 `rxdb_batch_upsert`，
 * 它对主键 `id` 走 `ON CONFLICT (id) DO UPDATE`，同 `id` 重复插入天然幂等（AC#15 依赖的正是
 * 这个行为），永远不会因为 `id` 冲突抛 23505。必须有一列独立于 `id` 的 UNIQUE 约束，插入两个
 * 不同 `id` 但相同该列取值的行，才会撞上 `ON CONFLICT (id)` 盖不住的唯一键冲突。
 */
@Entity({
  name: 'UniqueProbe',
  namespace: 'public',
  tableName: 'rls_unique_probe',
  sync: {
    type: SyncType.Full,
    local: { adapter: 'local' },
    remote: { adapter: 'remote' }
  },
  properties: [{ name: 'uniqueSlug', type: PropertyType.string }]
})
class UniqueProbe extends EntityBase {
  uniqueSlug!: string;
}

/** 注册一个随机用户并返回已认证的独立 `supabase-js` 会话与其 `auth.uid()` */
async function signUpRandomUser(): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const email = `us218-push-receipts-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const { data, error } = await client.auth.signUp({ email, password: 'us218-test-password' });
  if (error || !data.user) {
    throw new Error(`signUp 失败：${error?.message ?? '无 user'}`);
  }
  return { client, userId: data.user.id };
}

/**
 * 模拟「另一个用户已经把这行推上去了」：直接写 `rls_todos`，命中
 * `rxdb_log_change_trigger` 自动落一条 `rxdb_change`（INSERT），等价于一次真实推送的结果。
 */
async function insertAsExistingRemoteRow(
  client: SupabaseClient,
  createdBy: string,
  title: string
): Promise<{ id: UUID; title: string }> {
  const id = crypto.randomUUID();
  const { error } = await client
    .from('rls_todos')
    .insert({ id, title, completed: false, createdBy, updatedBy: createdBy });
  if (error) {
    throw new Error(`夹具写入 rls_todos 失败：${error.message}`);
  }
  return { id, title };
}

/**
 * 本批源变更里，某个本地实体 + 操作类型对应的全部 `RxDBChange` 行（新到旧）
 *
 * @remarks
 * `RxDBChange.entityId` 物理列存的是 {@link getRxDBChangeEntityIdQueryValues} 对应的编码值
 * （`__rxdb_change_id__:{...}` 前缀 JSON 信封，见 `change-codec.ts`），不是原始 id 的明文；
 * 通用 WHERE 构造器（`query_sql.utils.ts`）对这列没有特判，`operator: '='` 直接拿明文 id 去
 * 比较永远查不到行。必须按该文件自带的用法（`pull-conflict-utils.ts`/`cleanup-expired.ts`
 * 同款），用 `operator: 'in'` + `getRxDBChangeEntityIdQueryValues([entityId])`
 * （同时放回原始值与编码值，兼容新旧两种列内容）。
 */
async function findLocalChangesFor(
  localAdapter: RxDBAdapterWaSqlite,
  entityId: string,
  type: 'INSERT' | 'UPDATE' | 'DELETE'
): Promise<RxDBChange[]> {
  return localAdapter.getRepository(RxDBChange).find({
    where: {
      combinator: 'and',
      rules: [
        { field: 'entity', operator: '=', value: 'RlsTodo' },
        { field: 'entityId', operator: 'in', value: getRxDBChangeEntityIdQueryValues([entityId]) },
        { field: 'type', operator: '=', value: type }
      ]
    },
    orderBy: [{ field: 'id', sort: 'desc' }]
  });
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('推送提交：真实 RLS 被拒回执（US-218 阶段 B/C，T042/T052）', () => {
  let userA: { client: SupabaseClient; userId: string };
  let userB: { client: SupabaseClient; userId: string };
  let rxdb: RxDB;
  let remoteAdapter: RxDBAdapterSupabase;
  let localAdapter: RxDBAdapterWaSqlite;
  const mergeDurations: number[] = [];
  // 「部分被拒推送」场景的夹具行，三个 describe 块共享同一层外部作用域变量，避免跨块传参。
  let rowA1: { id: UUID; title: string };
  let rowA2: { id: UUID; title: string };
  let rowB1: RlsTodo;

  beforeAll(async () => {
    userA = await signUpRandomUser();
    userB = await signUpRandomUser();

    rxdb = new RxDB({
      dbName: `push-receipts-b-${Date.now()}`,
      context: { userId: userB.userId },
      entities: [RlsTodo, UniqueProbe],
      sync: {
        local: { adapter: 'wa-sqlite' },
        remote: { adapter: 'supabase' },
        type: SyncType.Full
      }
    });
    rxdb.adapter(
      'wa-sqlite',
      db => new RxDBAdapterWaSqlite(db, { vfs: 'MemoryAsyncVFS', async: true, worker: false, wasmPath: asyncWasmPath })
    );
    rxdb.adapter('supabase', async db => new RxDBAdapterSupabase(db, { client: userB.client }));
    rxdb.use(rxDBPluginHistory);
    rxdb.use(rxDBPluginSync);

    await rxdb.connect('wa-sqlite');
    remoteAdapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    localAdapter = (await rxdb.getAdapter('wa-sqlite')) as RxDBAdapterWaSqlite;

    // 只计 mergeChanges 这一次 RPC 往返（SC-009），排除本地 SQLite 的读写
    const mergeChanges = remoteAdapter.mergeChanges.bind(remoteAdapter);
    remoteAdapter.mergeChanges = async (...args: Parameters<typeof mergeChanges>) => {
      const startedAt = performance.now();
      try {
        return await mergeChanges(...args);
      } finally {
        mergeDurations.push(performance.now() - startedAt);
      }
    };
  });

  afterAll(async () => {
    try {
      await userA.client.from('rls_todos').delete().eq('createdBy', userA.userId);
      await userB.client.from('rls_todos').delete().eq('createdBy', userB.userId);
    } catch (error) {
      console.warn('rls_todos 清理失败（不影响断言结果）:', error);
    }
    await rxdb.disconnectAll();
  });

  describe('部分被拒推送（AC#8、9、10）', () => {
    beforeAll(async () => {
      // A 已经推过两行（这里用直接写表模拟，详见 insertAsExistingRemoteRow 的注释）
      rowA1 = await insertAsExistingRemoteRow(userA.client, userA.userId, 'A-row-to-be-deleted-by-B');
      rowA2 = await insertAsExistingRemoteRow(userA.client, userA.userId, 'A-row-to-be-updated-twice-by-B');

      // B 自己创建一行并推送（应 applied）
      rowB1 = new RlsTodo();
      rowB1.title = 'B-own-row';
      await rowB1.save();
      const pushBSetup = await rxdb.syncManager.pushRepository('public', 'RlsTodo');
      expect(pushBSetup.failed).toBe(0);

      // B 拉取，把 A 的两行同步到本地
      const pullB = await rxdb.syncManager.pullRepository('public', 'RlsTodo');
      expect(pullB.applied).toBeGreaterThanOrEqual(2);

      const localRowA1 = await firstValueFrom(RlsTodo.get(rowA1.id));
      const localRowA2 = await firstValueFrom(RlsTodo.get(rowA2.id));
      expect(localRowA1).toBeDefined();
      expect(localRowA2).toBeDefined();

      // B 删 A 的行（将被拒：DELETE 策略要求 createdBy = 自己）
      await localRowA1?.remove();
      // B 改自己的行（应 applied）
      rowB1.title = 'B-own-row-edited';
      await rowB1.save();
      // B 对 A 的另一行做两次修改（同一实体两条本地变更，压缩成一次远端 UPDATE，整条被拒）
      if (localRowA2) {
        localRowA2.title = 'A-row-edited-by-B-1';
        await localRowA2.save();
        localRowA2.title = 'A-row-edited-by-B-2';
        await localRowA2.save();
      }
    });

    it('推送：B 自己的修改 applied 并拿到远端 id（AC#8）', async () => {
      mergeDurations.length = 0;
      const result = await rxdb.syncManager.pushRepository('public', 'RlsTodo');
      const duration = mergeDurations.at(-1);
      console.info(`[US-218 SC-009] 混合批（1 applied + 2 组被拒）mergeChanges 耗时 ${duration?.toFixed(1)} ms`);
      expect(duration).toBeDefined();
      expect(duration).toBeLessThan(PUSH_BUDGET_MS);

      const [b1Change] = await findLocalChangesFor(localAdapter, rowB1.id, 'UPDATE');
      expect(b1Change).toBeDefined();
      expect(b1Change?.remoteId).not.toBeNull();
      expect(b1Change?.rejectedAt).toBeNull();

      // pushed 只数 applied 项（data-model §7），被拒的两组实体不算
      expect(result.pushed).toBe(1);
    });

    it('删除 A 的行被拒 42501/denied，本地变更标为被拒（AC#8、10）', async () => {
      const [deleteChange] = await findLocalChangesFor(localAdapter, rowA1.id, 'DELETE');
      expect(deleteChange).toBeDefined();
      expect(deleteChange?.rejectedAt).not.toBeNull();
      expect(deleteChange?.rejection).toMatchObject({ code: '42501', reason: 'denied' });
    });

    it('两次修改 A 的另一行被压缩成一次远端操作、整体被拒，两条源变更都标为被拒（AC#10）', async () => {
      const updateChanges = await findLocalChangesFor(localAdapter, rowA2.id, 'UPDATE');
      expect(updateChanges.length).toBe(2);
      for (const change of updateChanges) {
        expect(change.rejectedAt).not.toBeNull();
        expect(change.rejection).toMatchObject({ code: '42501', reason: 'denied' });
      }
    });

    it('再推一轮，被拒变更不再被重发（AC#9）', async () => {
      mergeDurations.length = 0;
      const result = await rxdb.syncManager.pushRepository('public', 'RlsTodo');

      // 被拒变更已有 rejectedAt、水位线也越过了它们，本轮查不到待推变更，不再调 mergeChanges
      expect(result.originalCount).toBe(0);
      expect(result.pushed).toBe(0);
      expect(result.failed).toBe(0);
      expect(mergeDurations).toHaveLength(0);
    });

    it('B 本地被删的 A1 行恢复为远端值，待推变更数扣除被拒部分后与推送前一致（AC#11，T052）', async () => {
      // 被拒的删除在本地对齐回远端当前值（data-model §7 步骤 3）
      const localRowA1 = await firstValueFrom(RlsTodo.get(rowA1.id));
      expect(localRowA1).toBeDefined();
      expect(localRowA1?.title).toBe(rowA1.title);
    });
  });

  describe('同批重试幂等（AC#15，直接调 adapter.mergeChanges，不经推送仓库）', () => {
    it('对同一批源变更调两次 mergeChanges，远端 id 相同', async () => {
      const entityId = crypto.randomUUID();
      const change: IRxDBChange = {
        id: 1,
        namespace: 'public',
        entity: 'RlsTodo',
        entityId,
        type: 'INSERT',
        branchId: 'main',
        patch: { id: entityId, title: 'AC15-idempotent-insert', completed: false, createdBy: userB.userId },
        inversePatch: null,
        clientId: `ac15-${entityId}`,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const actions = compactChanges([change]);

      const first = await remoteAdapter.mergeChanges(actions, 'main', [change]);
      const second = await remoteAdapter.mergeChanges(actions, 'main', [change]);

      expect(first.results[0]).toMatchObject({ status: 'applied' });
      expect(second.results[0]).toMatchObject({ status: 'applied' });
      const firstRemoteId = first.results[0].status === 'applied' ? first.results[0].remoteId : undefined;
      const secondRemoteId = second.results[0].status === 'applied' ? second.results[0].remoteId : undefined;
      expect(secondRemoteId).toBe(firstRemoteId);
    });
  });

  describe('不可归类 SQLSTATE 整批失败（AC#13，直接调 adapter.mergeChanges）', () => {
    it('制造一条 23505（唯一键冲突）→ SupabaseDataError，无回执返回', async () => {
      // rls_unique_probe.uniqueSlug 带独立于 id 的 UNIQUE 约束（见该实体类上的 @remarks）。
      // 先插入一行占住某个 slug（真实 applied），再用不同 id、相同 slug 的第二行去撞，
      // 这条唯一键冲突不在 42501 / RX001 / 23503 的可归类清单内，按 T043 的
      // 「其它码不捕获」原样向上抛（contracts/rxdb-mutations-receipts.md §5-6）。
      const slug = `ac13-${crypto.randomUUID()}`;
      const seedId = crypto.randomUUID();
      const seedChange: IRxDBChange = {
        id: 1,
        namespace: 'public',
        entity: 'UniqueProbe',
        entityId: seedId,
        type: 'INSERT',
        branchId: 'main',
        patch: { id: seedId, uniqueSlug: slug },
        inversePatch: null,
        clientId: `ac13-seed-${seedId}`,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const seedResult = await remoteAdapter.mergeChanges(compactChanges([seedChange]), 'main', [seedChange]);
      expect(seedResult.results[0]).toMatchObject({ status: 'applied' });

      const duplicateId = crypto.randomUUID();
      const duplicateChange: IRxDBChange = {
        id: 1,
        namespace: 'public',
        entity: 'UniqueProbe',
        entityId: duplicateId,
        type: 'INSERT',
        branchId: 'main',
        patch: { id: duplicateId, uniqueSlug: slug },
        inversePatch: null,
        clientId: `ac13-dup-${duplicateId}`,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const actions = compactChanges([duplicateChange]);

      const failure = await remoteAdapter.mergeChanges(actions, 'main', [duplicateChange]).catch(err => err);

      expect(failure).toBeInstanceOf(SupabaseDataError);
      expect((failure as InstanceType<typeof SupabaseDataError>).code).toBe('23505');
    });
  });
});
