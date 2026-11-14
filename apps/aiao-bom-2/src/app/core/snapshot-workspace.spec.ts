import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSnapshot, snapshotListItem } from './snapshot';
import { SnapshotWorkspace } from './snapshot-workspace';
import { WorkspaceRepository } from './storage';
import { makeStressDataset } from './stress-data';

const data = makeStressDataset(4);
const make = (id: string, patch = {}) =>
  createSnapshot({
    id,
    datasetId: data.id,
    name: id,
    source: 'dataset',
    structure: 'catalog',
    version: id,
    evaluationDate: '2026-11-14',
    observedOn: data.observedOn,
    savedAt: '2026-11-14T00:00:00.000Z',
    nodes: data.structures.catalog,
    ...patch
  });
const documents = new Map<string, unknown>();
let repository: WorkspaceRepository;
let workspace: SnapshotWorkspace;
const add = (id: string, patch = {}) => {
  const snapshot = make(id, patch);
  documents.set(`snapshot:${encodeURIComponent(data.id)}:${id}`, snapshot);
  return snapshot;
};
beforeEach(() => {
  documents.clear();
  repository = new WorkspaceRepository();
  workspace = new SnapshotWorkspace(repository);
  vi.spyOn(repository, 'read').mockImplementation(async key => documents.get(key));
  vi.spyOn(repository, 'readAll').mockResolvedValue([]);
  vi.spyOn(repository, 'writeMany').mockImplementation(async entries => {
    for (const [key, value] of entries) documents.set(key, value);
  });
});

describe('版本快照工作区', () => {
  it('只加载元数据，保存正文与目录为同一事务，独立保存的快照不互相覆盖', async () => {
    await workspace.openDataset(data.id);
    expect(repository.read).not.toHaveBeenCalled();
    const first = make('first');
    await workspace.save(first);
    expect(repository.writeMany).toHaveBeenCalledWith(
      [
        [`snapshot:${encodeURIComponent(data.id)}:first`, first],
        [`snapshot-meta:${encodeURIComponent(data.id)}:first`, snapshotListItem(first)]
      ],
      'add'
    );
    await workspace.save(make('second', { nodes: first.nodes.map(node => ({ ...node, quantity: '2' })) }));
    expect(workspace.entries().map(entry => entry.id)).toEqual(['first', 'second']);
    expect(workspace.result()?.summary.quantityChanges).toBe(4);
    expect(workspace.result()?.before.id).toBe('first');
    expect(workspace.result()?.after.id).toBe('second');
  });

  it('保存失败不更新目录，进行中的保存拒绝重复点击，重试可恢复', async () => {
    await workspace.openDataset(data.id);
    let reject!: (error: Error) => void;
    vi.mocked(repository.writeMany).mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        })
    );
    const task = workspace.save(make('a'));
    expect(workspace.saving()).toBe(true);
    await expect(workspace.save(make('b'))).rejects.toThrow('保存');
    const failure = expect(task).rejects.toThrow('quota');
    reject(new Error('quota'));
    await failure;
    expect(workspace.entries()).toEqual([]);
    expect(workspace.saving()).toBe(false);
    await workspace.save(make('b'));
    expect(workspace.entries()).toHaveLength(1);
    await expect(workspace.save(make('b'))).rejects.toThrow('存在');
  });

  it('跨结构比较返回可见错误，缺失/损坏正文和目录关联均拒绝', async () => {
    const a = add('a');
    const b = add('b', { structure: 'cad' });
    vi.mocked(repository.readAll).mockResolvedValue([snapshotListItem(a), snapshotListItem(b)]);
    await workspace.openDataset(data.id);
    await workspace.choose('before', 'a');
    await workspace.choose('after', 'b');
    expect(workspace.result()).toBeNull();
    expect(workspace.error()).toContain('同一结构');
    await workspace.choose('after', 'a');
    expect(workspace.result()?.changes).toHaveLength(0);
    documents.delete(`snapshot:${encodeURIComponent(data.id)}:a`);
    await workspace.compare();
    expect(workspace.error()).toContain('不存在');
    documents.set(`snapshot:${encodeURIComponent(data.id)}:a`, make('a', { datasetId: 'other' }));
    await workspace.compare();
    expect(workspace.error()).toContain('目录');
    documents.set(`snapshot:${encodeURIComponent(data.id)}:a`, {});
    await workspace.compare();
    expect(workspace.error()).toContain('格式');
  });

  it('晚到的读取结果与错误不能覆盖更新的比较选择', async () => {
    const a = add('a');
    const b = add('b', { nodes: a.nodes.map(node => ({ ...node, quantity: '2' })) });
    vi.mocked(repository.readAll).mockResolvedValue([snapshotListItem(a), snapshotListItem(b)]);
    await workspace.openDataset(data.id);
    let resolve!: (value: unknown) => void;
    vi.mocked(repository.read).mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const stale = workspace.choose('before', 'a');
    await workspace.choose('before', 'b');
    await workspace.choose('after', 'b');
    resolve(a);
    await stale;
    expect(workspace.result()?.before.id).toBe('b');
    expect(workspace.result()?.changes).toHaveLength(0);
    expect(workspace.loading()).toBe(false);
  });

  it('切换数据集丢弃旧目录、旧比较和旧保存反馈', async () => {
    await workspace.openDataset(data.id);
    let resolve!: () => void;
    vi.mocked(repository.writeMany).mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const saving = workspace.save(make('a'));
    await workspace.openDataset('other');
    resolve();
    await saving;
    expect(workspace.entries()).toEqual([]);
    expect(workspace.result()).toBeNull();
    await expect(workspace.save(make('b'))).rejects.toThrow('数据集');
    let finish!: (value: unknown[]) => void;
    vi.mocked(repository.readAll).mockImplementationOnce(
      () =>
        new Promise(done => {
          finish = done;
        })
    );
    const old = workspace.openDataset(data.id);
    await workspace.openDataset('newer');
    finish([snapshotListItem(make('a'))]);
    await old;
    expect(workspace.entries()).toEqual([]);
  });

  it('损坏目录和重复目录不能被伪装为空版本列表', async () => {
    vi.mocked(repository.readAll).mockResolvedValueOnce([{}]);
    await workspace.openDataset(data.id);
    expect(workspace.error()).toContain('快照');
    vi.mocked(repository.readAll).mockResolvedValueOnce([snapshotListItem(make('a')), snapshotListItem(make('a'))]);
    await workspace.openDataset(data.id);
    expect(workspace.error()).toContain('目录');
    vi.mocked(repository.readAll).mockRejectedValueOnce(new Error('blocked'));
    await workspace.openDataset(data.id);
    expect(workspace.error()).toContain('blocked');
    await workspace.compare();
    expect(workspace.result()).toBeNull();
  });
});
