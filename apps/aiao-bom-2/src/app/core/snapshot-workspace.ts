import { signal } from '@angular/core';
import {
  compareSnapshots,
  parseSnapshot,
  parseSnapshotMeta,
  snapshotListItem,
  type BomSnapshot,
  type BomSnapshotMeta,
  type SnapshotDiff
} from './snapshot';
import { WorkspaceRepository } from './storage';

const order = (left: BomSnapshotMeta, right: BomSnapshotMeta): number =>
  left.evaluationDate.localeCompare(right.evaluationDate) ||
  left.savedAt.localeCompare(right.savedAt) ||
  left.id.localeCompare(right.id);
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export class SnapshotWorkspace {
  private datasetId = '';
  private generation = 0;
  private request = 0;
  readonly entries = signal<BomSnapshotMeta[]>([]);
  readonly beforeId = signal('');
  readonly afterId = signal('');
  readonly result = signal<SnapshotDiff | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly ready = signal(false);

  constructor(private readonly repository: WorkspaceRepository) {}

  async openDataset(datasetId: string): Promise<void> {
    const generation = ++this.generation;
    this.datasetId = datasetId;
    this.request++;
    this.ready.set(false);
    this.entries.set([]);
    this.beforeId.set('');
    this.afterId.set('');
    this.result.set(null);
    this.error.set('');
    this.loading.set(false);
    this.saving.set(false);
    try {
      const values = await this.repository.readAll<unknown>(`snapshot-meta:${encodeURIComponent(datasetId)}:`);
      if (generation !== this.generation) return;
      const entries = values.map(parseSnapshotMeta).sort(order);
      if (
        entries.some(entry => entry.datasetId !== datasetId) ||
        new Set(entries.map(entry => entry.id)).size !== entries.length
      )
        throw new Error('快照目录关联错误或包含重复身份');
      this.entries.set(entries);
      this.ready.set(true);
      const after = entries.at(-1);
      this.afterId.set(after?.id ?? '');
      this.beforeId.set(entries.slice(0, -1).findLast(entry => entry.structure === after?.structure)?.id ?? '');
    } catch (error) {
      if (generation === this.generation) this.error.set(`版本目录读取失败：${message(error)}`);
    }
  }

  async save(input: BomSnapshot): Promise<void> {
    if (this.saving()) throw new Error('快照正在保存，请等待提交');
    const snapshot = parseSnapshot(input);
    if (snapshot.datasetId !== this.datasetId) throw new Error('当前数据集已经改变，请重新保存');
    if (this.entries().some(entry => entry.id === snapshot.id)) throw new Error('该快照已经存在');
    if (!this.ready()) throw new Error('请先重新读取版本目录，保留已有快照');
    const generation = this.generation;
    this.saving.set(true);
    try {
      await this.repository.writeMany(
        [
          [this.documentKey(snapshot.id), snapshot],
          [
            `snapshot-meta:${encodeURIComponent(snapshot.datasetId)}:${encodeURIComponent(snapshot.id)}`,
            snapshotListItem(snapshot)
          ]
        ],
        'add'
      );
      if (generation !== this.generation) return;
      const previous = this.entries().findLast(entry => entry.structure === snapshot.structure);
      this.entries.update(entries => [...entries, snapshotListItem(snapshot)].sort(order));
      this.beforeId.set(previous?.id ?? '');
      this.afterId.set(snapshot.id);
      await this.compare();
    } finally {
      if (generation === this.generation) this.saving.set(false);
    }
  }

  async choose(side: 'before' | 'after', id: string): Promise<void> {
    (side === 'before' ? this.beforeId : this.afterId).set(id);
    await this.compare();
  }

  async compare(): Promise<void> {
    const request = ++this.request;
    this.result.set(null);
    this.error.set('');
    this.loading.set(false);
    const before = this.entries().find(entry => entry.id === this.beforeId());
    const after = this.entries().find(entry => entry.id === this.afterId());
    if (!before || !after) return;
    if (before.structure !== after.structure) {
      this.error.set('只能比较同一结构来源的快照，请重新选择基准或目标版本');
      return;
    }
    this.loading.set(true);
    try {
      const [left, right] = await Promise.all([this.read(before), this.read(after)]);
      if (request === this.request) this.result.set(compareSnapshots(left, right));
    } catch (error) {
      if (request === this.request) this.error.set(`版本比较失败：${message(error)}`);
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  async exportSelected(): Promise<BomSnapshot> {
    const meta = this.entries().find(entry => entry.id === this.afterId());
    if (!meta) throw new Error('请先选择目标版本');
    return this.read(meta);
  }

  private documentKey(id: string): string {
    return `snapshot:${encodeURIComponent(this.datasetId)}:${encodeURIComponent(id)}`;
  }

  private async read(meta: BomSnapshotMeta): Promise<BomSnapshot> {
    const raw = await this.repository.read<unknown>(this.documentKey(meta.id));
    if (raw === undefined) throw new Error(`快照不存在：${meta.name}`);
    const snapshot = parseSnapshot(raw);
    if (JSON.stringify(snapshotListItem(snapshot)) !== JSON.stringify(meta))
      throw new Error(`快照正文与目录不一致：${meta.name}`);
    return snapshot;
  }
}
