import type { IRepository } from '@aiao/rxdb';
import type { RxdbFileStorage } from '@aiao/rxdb-plugin-storage';

import { DesktopFile } from './desktop-file.entity';
import { mimeTypeOf } from './disk-kinds';
import { DiskPath, isWithin, parentOf } from './disk-path';
import { DiskEntry, DiskEntryKind, DiskError, DiskFileInfo, DiskStore } from './disk-store';

/** storage 插件里存放文件体的目录：文件体按随机名平铺，改名与移动只改目录树，不动 OPFS。 */
export const BLOB_DIR = 'blobs';

const ALL = { combinator: 'and' as const, rules: [] };

/** 行的 id；卷根下的条目的父 id 为 `null`。 */
type FileId = DesktopFile['id'];
type ParentId = FileId | null;

export interface RxdbDiskDependencies {
  repository(): Promise<IRepository<typeof DesktopFile>>;
  instantiate(data: Partial<DesktopFile>): DesktopFile;
  storage(): RxdbFileStorage;
  now(): number;
}

/** 目录树的内存索引：按 id，以及按「父 id → 名字」。卷根的父 id 为 `null`。 */
class FileIndex {
  private readonly byId = new Map<FileId, DesktopFile>();
  private readonly byParent = new Map<ParentId, Map<string, DesktopFile>>();

  constructor(rows: readonly DesktopFile[]) {
    for (const row of rows) this.add(row);
  }

  add(row: DesktopFile): void {
    this.byId.set(row.id, row);
    const siblings = this.byParent.get(row.parentId ?? null) ?? new Map<string, DesktopFile>();
    siblings.set(row.name, row);
    this.byParent.set(row.parentId ?? null, siblings);
  }

  drop(id: FileId, parentId: ParentId, name: string): void {
    this.byId.delete(id);
    this.byParent.get(parentId)?.delete(name);
  }

  child(parentId: ParentId, name: string): DesktopFile | undefined {
    return this.byParent.get(parentId)?.get(name);
  }

  children(parentId: ParentId): DesktopFile[] {
    return [...(this.byParent.get(parentId)?.values() ?? [])];
  }

  /** 深度优先、子项在前：删除时先删叶子。 */
  subtree(row: DesktopFile): DesktopFile[] {
    return [...this.children(row.id).flatMap(child => this.subtree(child)), row];
  }
}

const leaf = (path: DiskPath): string => {
  const name = path.at(-1);
  if (name === undefined) throw new DiskError('EACCES', path, 'Macintosh HD itself cannot be changed');
  return name;
};

/**
 * Macintosh HD 的存储后端：目录树与元数据是 `DesktopFile` 行，文件体交给 storage 插件（OPFS）。
 * 所有写入都经过这里（同一个标签页里串行），所以写穿的内存索引就是库里的现状。
 */
export class RxdbDiskStore implements DiskStore {
  private index: Promise<FileIndex> | null = null;

  constructor(private readonly deps: RxdbDiskDependencies) {}

  /** 库被整体改写（抹掉）之后丢掉索引，下次用时重读。 */
  invalidate(): void {
    this.index = null;
  }

  async list(dir: DiskPath): Promise<DiskEntry[]> {
    const index = await this.loaded();
    const parentId = await this.directoryId(dir);
    return index
      .children(parentId)
      .map(row => ({ name: row.name, kind: row.type === 'folder' ? 'directory' : 'file' }));
  }

  async kindOf(path: DiskPath): Promise<DiskEntryKind | null> {
    if (!path.length) return 'directory';
    const row = await this.find(path);
    if (!row) return null;
    return row.type === 'folder' ? 'directory' : 'file';
  }

  async info(file: DiskPath): Promise<DiskFileInfo> {
    const row = await this.fileRow(file);
    return { size: row.size, modified: row.modifiedAt.getTime() };
  }

  async read(file: DiskPath): Promise<Uint8Array> {
    const row = await this.fileRow(file);
    if (!row.contentId) return new Uint8Array(0);
    return new Uint8Array(await (await this.deps.storage().read(row.contentId)).arrayBuffer());
  }

  async write(file: DiskPath, data: Uint8Array): Promise<void> {
    const index = await this.loaded();
    const parentId = await this.ensureDirectory(parentOf(file));
    const name = leaf(file);
    const existing = index.child(parentId, name);
    if (existing?.type === 'folder') throw new DiskError('EISDIR', file);
    const mimeType = mimeTypeOf(name);
    const blob = await this.deps
      .storage()
      .upload(new File([data.slice()], crypto.randomUUID(), { type: mimeType }), { path: BLOB_DIR });
    const fields = { size: data.length, mimeType, contentId: blob.id, modifiedAt: new Date(this.deps.now()) };
    const repository = await this.deps.repository();
    try {
      const row =
        existing ?
          await repository.update(existing, fields)
        : await repository.create(this.deps.instantiate({ name, type: 'file', parentId, ...fields }));
      index.add(row);
    } catch (error) {
      await this.deps.storage().delete(blob.id);
      throw error;
    }
    if (existing?.contentId) await this.deps.storage().delete(existing.contentId);
  }

  async mkdir(dir: DiskPath): Promise<void> {
    await this.ensureDirectory(dir);
  }

  async remove(path: DiskPath): Promise<void> {
    const index = await this.loaded();
    const row = await this.find(path);
    if (!row) return;
    const repository = await this.deps.repository();
    const rows = index.subtree(row);
    for (const doomed of rows) {
      const parentId = doomed.parentId ?? null;
      await repository.remove(doomed);
      index.drop(doomed.id, parentId, doomed.name);
    }
    for (const doomed of rows) if (doomed.contentId) await this.deps.storage().delete(doomed.contentId);
  }

  async move(from: DiskPath, to: DiskPath): Promise<void> {
    const index = await this.loaded();
    const row = await this.find(from);
    if (!row) throw new DiskError('ENOENT', from);
    if (await this.find(to)) throw new DiskError('EEXIST', to);
    if (isWithin(to, from)) throw new DiskError('EACCES', to, `“${leaf(from)}” can’t be moved into itself.`);
    const parentId = await this.ensureDirectory(parentOf(to));
    const previous = { parentId: row.parentId ?? null, name: row.name };
    const moved = await (await this.deps.repository()).update(row, { parentId, name: leaf(to) });
    index.drop(row.id, previous.parentId, previous.name);
    index.add(moved);
  }

  private loaded(): Promise<FileIndex> {
    this.index ??= this.deps
      .repository()
      .then(repository => repository.find({ where: ALL }))
      .then(rows => new FileIndex(rows));
    return this.index;
  }

  private async find(path: DiskPath): Promise<DesktopFile | undefined> {
    const index = await this.loaded();
    let parentId: ParentId = null;
    let row: DesktopFile | undefined;
    for (const name of path) {
      row = index.child(parentId, name);
      if (!row) return undefined;
      parentId = row.id;
    }
    return row;
  }

  private async fileRow(path: DiskPath): Promise<DesktopFile> {
    const row = await this.find(path);
    if (!row) throw new DiskError('ENOENT', path);
    if (row.type !== 'file') throw new DiskError('EISDIR', path);
    return row;
  }

  /** 已存在的目录的 id（卷根为 `null`）；不存在时抛 `ENOENT`。 */
  private async directoryId(dir: DiskPath): Promise<ParentId> {
    if (!dir.length) return null;
    const row = await this.find(dir);
    if (!row) throw new DiskError('ENOENT', dir);
    if (row.type !== 'folder') throw new DiskError('ENOTDIR', dir);
    return row.id;
  }

  /** 逐级补建目录（`mkdir -p`），返回最深一级的 id。 */
  private async ensureDirectory(dir: DiskPath): Promise<ParentId> {
    const index = await this.loaded();
    let parentId: ParentId = null;
    for (const [depth, name] of dir.entries()) {
      const existing: DesktopFile | undefined = index.child(parentId, name);
      if (existing && existing.type !== 'folder') throw new DiskError('ENOTDIR', dir.slice(0, depth + 1));
      parentId = existing ? existing.id : await this.createFolder(index, parentId, name);
    }
    return parentId;
  }

  private async createFolder(index: FileIndex, parentId: ParentId, name: string): Promise<FileId> {
    const folder = this.deps.instantiate({
      name,
      type: 'folder',
      parentId,
      size: 0,
      mimeType: null,
      contentId: null,
      modifiedAt: new Date(this.deps.now())
    });
    const row = await (await this.deps.repository()).create(folder);
    index.add(row);
    return row.id;
  }
}
