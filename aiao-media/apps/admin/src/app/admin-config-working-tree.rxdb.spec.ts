import {
  MediaPlatformModel,
  MediaPromptTemplate,
  MediaProviderPolicy,
  type MediaConfigCommitEnvelope
} from '@aiao-media/domain';
import { RxDB, SyncType, type UUID } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginWorkingTree, type WorkingTreeCommitEvent } from '@aiao/rxdb-plugin-working-tree';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createAdminConfigProjection,
  createAdminConfigProjectionStore,
  createMediaConfigCommitEnvelopeFromWorkingTree,
  type AdminConfigProjectionClient
} from './admin-config-projection';
import type { RemoteConfigProjection } from './product-client';

const workspaceId = '40000000-0000-4000-8000-000000000001' as UUID;
const authorId = '40000000-0000-4000-8000-000000000002';

/** 按服务端语义模拟投影表：写入后为 synced，重复写入不产生新行。 */
function projectionServer(): AdminConfigProjectionClient & { readonly saved: Map<string, MediaConfigCommitEnvelope> } {
  const saved = new Map<string, MediaConfigCommitEnvelope>();
  return {
    saved,
    configProjection: async (commitId: string): Promise<RemoteConfigProjection | null> => {
      const envelope = saved.get(commitId);
      return envelope ?
          { status: 'synced', changeCount: envelope.commit.changeCount, receivedChanges: envelope.changes.length }
        : null;
    },
    pushConfigCommit: async envelope => {
      if (!saved.has(envelope.commit.id)) saved.set(envelope.commit.id, envelope);
    }
  };
}

describe('Admin 配置在真实 RxDB 工作树上的捕获、提交、投影与分支', () => {
  let rxdb: RxDB;

  const templates = () => rxdb.entityManager.getRepository(MediaPromptTemplate);
  const readTemplate = async (id: UUID) =>
    (
      await firstValueFrom(
        templates().findAll({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id }] } })
      )
    )[0];
  const readEntity = async (entity: string, entityId: string): Promise<Record<string, unknown> | null> => {
    if (entity !== 'MediaPromptTemplate') throw new Error(`测试只覆盖模板：${entity}`);
    const row = await readTemplate(entityId as UUID);
    return row ? { ...row } : null;
  };
  const commit = async (message: string) => {
    const status = await rxdb.workingTree.status();
    const result = await rxdb.workingTree.commit(message, {
      expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
      expectedHeadRevision: status.headRevision,
      expectedWorkingTreeRevision: status.workingTreeRevision,
      authorId,
      operationId: crypto.randomUUID()
    });
    if (!result.ok) throw new Error(`提交被拒：${JSON.stringify(result)}`);
    return result.commitId;
  };
  const project = (commitId: string) =>
    createMediaConfigCommitEnvelopeFromWorkingTree(rxdb.workingTree, { commitId, workspaceId, authorId, readEntity });

  beforeAll(async () => {
    // jsdom 的 crypto 桩没有 getRandomValues，File/Blob 没有 arrayBuffer；PGlite 与 RxDB 需要 Node 的实现。
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal('File', NodeFile);
    rxdb = new RxDB({
      dbName: `admin-config-working-tree-${Date.now()}`,
      context: { userId: authorId as UUID },
      entities: [MediaPromptTemplate, MediaProviderPolicy, MediaPlatformModel],
      sync: { type: SyncType.None, local: { adapter: 'pglite' } }
    });
    rxdb.use(rxDBPluginHistory);
    rxdb.use(rxDBPluginWorkingTree);
    rxdb.adapter('pglite', database => new RxDBAdapterPGlite(database, { store: 'memory' }));
    await rxdb.connect('pglite');
    await rxdb.workingTree.enable();
  });

  afterAll(async () => {
    await rxdb.destroy();
    vi.unstubAllGlobals();
  });

  let first = '';
  let hero: UUID;

  it('配置编辑进入工作树，提交只发一次事件并留下以系统基线为父的可达历史', async () => {
    const created = await templates().create(
      rxdb.entityManager.instantiate(MediaPromptTemplate, {
        workspaceId,
        branchId: 'main',
        revision: 1,
        key: 'hero',
        title: '首页',
        prompt: '生成海报',
        tags: ['media'],
        enabled: true
      })
    );
    hero = created.id;
    const dirty = await rxdb.workingTree.status();
    expect(dirty.clean).toBe(false);
    const diff = await rxdb.workingTree.diff();
    expect(diff.entries.map(entry => [entry.namespace, entry.entity, entry.operation, entry.origin])).toEqual([
      ['public', 'MediaPromptTemplate', 'insert', 'local']
    ]);

    const events: WorkingTreeCommitEvent[] = [];
    const subscription = rxdb.workingTree.commits$.subscribe(event => events.push(event));
    first = await commit('新增首页模板');
    subscription.unsubscribe();
    expect(events.map(event => event.commitId)).toEqual([first]);
    expect((await rxdb.workingTree.status()).clean).toBe(true);
    const history = await rxdb.workingTree.listCommits();
    const head = history.entries.find(entry => entry.commitId === first);
    expect(head?.kind).toBe('normal');
    expect(history.entries.find(entry => entry.commitId === head?.parentIds[0])?.kind).toBe('baseline');
    expect((await rxdb.workingTree.commitChanges(first)).entries).toHaveLength(1);
  });

  it('投影跳过系统基线父提交，只带白名单字段，插入不带 CAS 预期值', async () => {
    const envelope = await project(first);
    expect(envelope.commit.parentIds).toEqual([]);
    expect(envelope.commit.changeCount).toBe(1);
    expect(envelope.changes[0]).toMatchObject({
      entity: 'MediaPromptTemplate',
      entityId: hero,
      operation: 'insert',
      expectedRevision: null,
      patch: { value: { key: 'hero', title: '首页', prompt: '生成海报', tags: ['media'], enabled: true } }
    });
    expect(envelope.changes[0]?.patch).not.toHaveProperty('value.workspaceId');
  });

  it('后续提交经事件投影一次；进程在投影前退出后，补偿扫描补齐缺失投影且不重复', async () => {
    const server = projectionServer();
    const store = createAdminConfigProjectionStore(server);
    const running = createAdminConfigProjection({
      workingTree: rxdb.workingTree,
      workspaceId,
      authorId,
      store,
      readEntity
    });
    await running.start();
    expect([...server.saved.keys()]).toEqual([first]);

    const current = await readTemplate(hero);
    await templates().update(current!, { title: '新首页' });
    const second = await commit('修改首页标题');
    await running.idle();
    expect(server.saved.get(second)?.commit.parentIds).toEqual([first]);
    expect(server.saved.get(second)?.changes[0]).toMatchObject({ operation: 'update', expectedRevision: 1 });
    running.stop();

    // 模拟提交后、投影前进程退出：没有订阅者收到事件。
    await templates().update((await readTemplate(hero))!, { prompt: '生成新海报' });
    const third = await commit('修改提示词');
    expect(server.saved.has(third)).toBe(false);
    const restarted = createAdminConfigProjection({
      workingTree: rxdb.workingTree,
      workspaceId,
      authorId,
      store,
      readEntity
    });
    await restarted.start();
    await restarted.idle();
    expect([...server.saved.keys()]).toEqual([first, second, third]);
    await restarted.compensate();
    expect(server.saved.size).toBe(3);
    restarted.stop();
  });

  it('从提交建配置分支：分支上的提交投影到所属分支，父提交穿过分支基线指向分叉点', async () => {
    const head = (await rxdb.workingTree.listCommits()).headCommitId!;
    await rxdb.workingTree.createBranchFromCommit('config-draft', head);
    await rxdb.versionManager.switchBranch('config-draft');
    await templates().update((await readTemplate(hero))!, { title: '分支标题' });
    const branchCommit = await commit('分支改标题');
    const envelope = await project(branchCommit);
    expect(envelope.commit.branchId).toBe('config-draft');
    expect(envelope.commit.parentIds).toEqual([head]);
  });

  it('两个分支改同一字段时，合并预览暴露覆盖冲突，双方提交都保留在各自历史中可恢复', async () => {
    await rxdb.versionManager.switchBranch('main');
    await templates().update((await readTemplate(hero))!, { title: '主线标题' });
    const mainCommit = await commit('主线改标题');
    const preview = await rxdb.versionManager.previewMerge('config-draft');
    const conflicted = preview.entries.find(entry => entry.entity === 'MediaPromptTemplate' && entry.entityId === hero);
    expect(conflicted?.conflict).toEqual({ kind: 'overwrite', fields: ['title'] });
    expect((await rxdb.workingTree.listCommits()).entries.some(entry => entry.commitId === mainCommit)).toBe(true);
    expect((await readTemplate(hero))?.title).toBe('主线标题');
    await rxdb.versionManager.switchBranch('config-draft');
    expect((await readTemplate(hero))?.title).toBe('分支标题');
    await rxdb.versionManager.switchBranch('main');
  });
});
