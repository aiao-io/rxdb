import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { firstValueFrom } from 'rxjs';
import { parseImport } from './draft';
import type { DraftCommit, DraftState } from './types';

@Entity({
  namespace: 'bom2',
  name: 'DraftDocument',
  properties: [{ name: 'body', type: PropertyType.string }]
})
class DraftDocument extends EntityBase {
  body!: string;
}

export async function openDraftDatabase(datasetId: string) {
  const db = new RxDB({
    dbName: `aiao-bom-2-worktrees-${encodeURIComponent(datasetId)}`,
    entities: [DraftDocument],
    context: { userId: 'local-engineer' },
    sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
  });
  db.use(rxDBPluginHistory);
  db.use(rxDBPluginWorkingTree);
  db.adapter(
    'wa-sqlite',
    database =>
      new RxDBAdapterWaSqlite(database, {
        vfs: 'IDBBatchAtomicVFS',
        async: true,
        worker: false,
        wasmPath: '/wa-sqlite/wa-sqlite-async.wasm',
        batchTimeout: 1
      })
  );
  await db.connect('wa-sqlite');
  if (!(await db.workingTree.isEnabled())) await db.workingTree.enable();
  const document = async () => {
    const adapter = await firstValueFrom(db.localAdapter$);
    return adapter.transaction(async executor => {
      const rows = await executor.getRepository(DraftDocument).find({ where: { combinator: 'and', rules: [] } });
      return rows[0];
    });
  };
  const save = async (draft: DraftState): Promise<void> => {
    const adapter = await firstValueFrom(db.localAdapter$);
    await adapter.transaction(async executor => {
      const repository = executor.getRepository(DraftDocument);
      const [row] = await repository.find({ where: { combinator: 'and', rules: [] } });
      if (row) {
        await repository.update(row, { body: JSON.stringify(draft) });
        return;
      }
      const created = db.entityManager.instantiate(DraftDocument);
      created.body = JSON.stringify(draft);
      await repository.create(created);
    });
  };
  const committedDraft = async (commitId: string): Promise<DraftState> => {
    const changes = await db.workingTree.commitChanges(commitId);
    const body = [...changes.entries]
      .reverse()
      .find(change => change.entity === 'DraftDocument' && typeof change.patch?.['body'] === 'string')?.patch?.['body'];
    if (typeof body !== 'string') throw new Error('提交记录缺少工作草稿内容');
    return parseImport(body);
  };
  return {
    async mount(branchId: string, name: string): Promise<void> {
      const trees = await db.workingTree.checkouts.list();
      let tree = trees.find(item => item.mode === 'writable' && item.branchId === branchId);
      if (!tree) {
        await db.versionManager.createBranch(branchId);
        tree = await db.workingTree.checkouts.add(branchId, { name: `${name} · ${branchId}`, owner: 'persistent' });
      }
      await db.workingTree.checkouts.mount(tree.id);
    },
    async read(): Promise<DraftState | undefined> {
      const row = await document();
      return row ? parseImport(row.body) : undefined;
    },
    save,
    async commit(message: string, operationId: string) {
      const status = await db.workingTree.status();
      const result = await db.workingTree.commit(message, {
        authorId: 'local-engineer',
        operationId,
        expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
        expectedHeadRevision: status.headRevision,
        expectedWorkingTreeRevision: status.workingTreeRevision
      });
      if (!result.ok) throw new Error('工作树已被其他操作修改，请重新核对后提交');
      const log = await db.workingTree.listCommits({ limit: 1 });
      const entry = log.entries.find(item => item.commitId === result.commitId);
      if (!entry) throw new Error('提交成功但历史记录不可读取');
      return { id: entry.commitId, parentId: entry.firstParentId, createdAt: entry.createdAt.toISOString() };
    },
    async history() {
      const status = await db.workingTree.status();
      const log = await db.workingTree.listCommits();
      const commits: DraftCommit[] = [];
      for (const entry of log.entries.filter(item => item.kind === 'normal')) {
        const draft = await committedDraft(entry.commitId);
        commits.push({
          schema: 'aiao-bom-2-commit/1',
          id: entry.commitId,
          parentId: entry.firstParentId,
          branchId: status.branchId,
          datasetId,
          message: entry.message,
          revision: draft.revision,
          nodeCount: draft.nodes.length,
          createdAt: entry.createdAt.toISOString(),
          draft
        });
      }
      const headCommitId = commits.find(commit => commit.id === log.headCommitId)?.id ?? null;
      return { headCommitId, dirty: !headCommitId || !status.clean, commits };
    },
    async restore(commitId: string): Promise<DraftState> {
      const status = await db.workingTree.status();
      const draft = await committedDraft(commitId);
      const result = await db.workingTree.restore(
        { commitId },
        {
          expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
          expectedHeadRevision: status.headRevision,
          expectedWorkingTreeRevision: status.workingTreeRevision
        }
      );
      if (!result.ok) throw new Error(`版本恢复失败：${result.reason}`);
      await save(draft);
      return draft;
    },
    async close(): Promise<void> {
      await db.disconnect('wa-sqlite');
    }
  };
}
