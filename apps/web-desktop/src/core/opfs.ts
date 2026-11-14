import { decodeBytes, encodeBytes } from './bytes.js';
import type { DesktopDatabase } from './database.js';
import { requireCondition } from './errors.js';
import { validateState } from './session.js';
import type { DesktopState, VirtualFile } from './types.js';

const INTERNAL = '.orbit-desktop';
const JOURNAL = 'pending.json';
type FileTree = Map<string, VirtualFile>;
interface Journal {
  before: VirtualFile[];
  after: VirtualFile[];
}

function tree(files: VirtualFile[]): FileTree {
  const indexed = new Map(files.map(file => [file.id, file]));
  function path(file: VirtualFile): string {
    if (file.deleted && file.trashId === file.id) return `${INTERNAL}/trash/${file.id}/${file.name}`;
    const parent = file.parentId === null ? undefined : indexed.get(file.parentId);
    return parent ? `${path(parent)}/${file.name}` : file.name;
  }
  return new Map(files.map(file => [path(file), file]));
}

async function directory(root: FileSystemDirectoryHandle, path: string[], create = false) {
  let current = root;
  for (const name of path) current = await current.getDirectoryHandle(name, { create });
  return current;
}

async function put(root: FileSystemDirectoryHandle, path: string, bytes: Uint8Array<ArrayBuffer>) {
  const parts = path.split('/');
  const name = parts.pop()!;
  const parent = await directory(root, parts, true);
  const handle = await parent.getFileHandle(name, { create: true });
  const writer = await handle.createWritable();
  try {
    await writer.write(bytes);
    await writer.close();
  } catch (error) {
    await writer.abort();
    throw error;
  }
}

async function remove(root: FileSystemDirectoryHandle, path: string) {
  const parts = path.split('/');
  const name = parts.pop()!;
  try {
    const parent = await directory(root, parts);
    await parent.removeEntry(name, { recursive: true });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
  }
}

function sameEntry(a: VirtualFile | undefined, b: VirtualFile) {
  return a?.kind === b.kind && a.bytes === b.bytes;
}

async function apply(root: FileSystemDirectoryHandle, before: VirtualFile[], after: VirtualFile[]) {
  const previous = tree(before);
  const next = tree(after);
  const removed = [...previous].filter(([path, file]) => !next.has(path) || next.get(path)?.kind !== file.kind);
  for (const [path] of removed.sort((a, b) => b[0].split('/').length - a[0].split('/').length))
    await remove(root, path);
  const changed = [...next].filter(([path, file]) => !sameEntry(previous.get(path), file));
  for (const [path, file] of changed.sort((a, b) => a[0].split('/').length - b[0].split('/').length)) {
    if (file.kind === 'directory') await directory(root, path.split('/'), true);
    else await put(root, path, decodeBytes(file.bytes));
  }
}

function mimeType(name: string, type: string): string {
  if (type) return type;
  const extension = name.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    csv: 'text/csv',
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    ts: 'text/plain',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    svg: 'image/svg+xml',
    pdf: 'application/pdf'
  };
  return types[extension ?? ''] ?? 'application/octet-stream';
}

async function scan(root: FileSystemDirectoryHandle, files: VirtualFile[]): Promise<VirtualFile[]> {
  const previous = tree(files);
  const result: VirtualFile[] = files.filter(file => file.deleted);
  async function visit(handle: FileSystemDirectoryHandle, prefix: string, parentId: string | null) {
    const entries: [string, FileSystemHandle][] = [];
    for await (const entry of handle.entries()) entries.push(entry);
    for (const [name, entry] of entries.sort(([a], [b]) => a.localeCompare(b))) {
      if (!prefix && name === INTERNAL) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      const old = previous.get(path);
      const existing = old?.kind === entry.kind ? old : undefined;
      const physical = entry.kind === 'file' ? await (entry as FileSystemFileHandle).getFile() : null;
      const bytes = physical ? encodeBytes(new Uint8Array(await physical.arrayBuffer())) : '';
      const changed = existing && bytes !== existing.bytes;
      const item: VirtualFile = {
        id: existing?.id ?? crypto.randomUUID(),
        name,
        parentId,
        kind: entry.kind,
        mime: physical ? (existing?.mime ?? mimeType(name, physical.type)) : 'text/plain',
        bytes,
        revision: (existing?.revision ?? 1) + (changed ? 1 : 0),
        modified: changed || !existing ? (physical?.lastModified ?? Date.now()) : existing.modified,
        deleted: false,
        trashId: null
      };
      result.push(item);
      if (entry.kind === 'directory') await visit(entry as FileSystemDirectoryHandle, path, item.id);
    }
  }
  await visit(root, '', null);
  const ids = new Set(result.map(file => file.id));
  return result.map(file =>
    file.deleted && file.parentId !== null && !ids.has(file.parentId) ? { ...file, parentId: null } : file
  );
}

async function readJournal(internal: FileSystemDirectoryHandle): Promise<Journal | null> {
  try {
    const handle = await internal.getFileHandle(JOURNAL);
    const value: Journal = JSON.parse(await (await handle.getFile()).text());
    requireCondition(Array.isArray(value.before) && Array.isArray(value.after), 'STORAGE', 'OPFS 恢复记录损坏');
    return value;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null;
    throw error;
  }
}

/** 以 OPFS 作为文件目录和字节来源，IndexedDB 保留桌面配置与稳定文件标识。 */
export async function openOpfsDatabase(
  database: DesktopDatabase,
  owns: () => boolean,
  root: FileSystemDirectoryHandle
): Promise<DesktopDatabase> {
  let closed = false;
  let queue: Promise<unknown> = Promise.resolve();
  const check = () => requireCondition(!closed && owns(), 'OWNERSHIP', 'OPFS 桌面控制权已失效');
  check();
  const internal = await root.getDirectoryHandle(INTERNAL, { create: true });
  const journal = await readJournal(internal);
  const stored = await database.read();
  if (journal) {
    validateState({ ...stored, files: journal.before });
    validateState({ ...stored, files: journal.after });
    check();
    const committed = JSON.stringify(stored.files) === JSON.stringify(journal.after);
    await apply(root, committed ? journal.before : journal.after, committed ? journal.after : journal.before);
    await remove(internal, JOURNAL);
  }
  let initialized = true;
  try {
    await internal.getFileHandle('initialized');
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
    initialized = false;
  }
  if (!initialized) {
    check();
    const actual = await scan(root, []);
    const occupied = tree(actual);
    const conflict = [...tree(stored.files)].find(
      ([path, file]) => occupied.has(path) && !sameEntry(occupied.get(path), file)
    );
    requireCondition(!conflict, 'EXISTS', `旧桌面文件与 OPFS 路径冲突：${conflict?.[0] ?? ''}`);
    await apply(root, [], stored.files);
    await put(internal, 'initialized', new Uint8Array());
  }
  async function load(): Promise<DesktopState> {
    check();
    const state = await database.read();
    const files = await scan(root, state.files);
    check();
    if (JSON.stringify(files) === JSON.stringify(state.files)) return state;
    state.files = files;
    await database.transact(draft => {
      draft.files = files;
    });
    return state;
  }
  function enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = queue.then(action);
    queue = result.catch(() => undefined);
    return result;
  }
  return {
    read: () => enqueue(load),
    transact: operation =>
      enqueue(async () => {
        const before = await load();
        const after = structuredClone(before);
        const result = operation(after);
        validateState(after);
        requireCondition(
          !after.files.some(file => !file.deleted && file.parentId === null && file.name === INTERNAL),
          'INVALID',
          '此名称由桌面存储保留'
        );
        check();
        if (JSON.stringify(before.files) === JSON.stringify(after.files)) {
          await database.transact(draft => Object.assign(draft, after));
          return result;
        }
        try {
          await put(
            internal,
            JOURNAL,
            new TextEncoder().encode(JSON.stringify({ before: before.files, after: after.files }))
          );
        } catch (error) {
          await remove(internal, JOURNAL);
          throw error;
        }
        try {
          await apply(root, before.files, after.files);
          check();
          await database.transact(draft => Object.assign(draft, after));
        } catch (error) {
          await apply(root, after.files, before.files);
          await remove(internal, JOURNAL);
          throw error;
        }
        await remove(internal, JOURNAL);
        return result;
      }),
    flush: async () => {
      await queue;
      await database.flush();
    },
    close: () => {
      closed = true;
      database.close();
    }
  };
}

/** 在用户确认清除全部数据后，删除此来源的真实文件与内部恢复记录。 */
export async function resetOpfs(owns: () => boolean, root: FileSystemDirectoryHandle): Promise<void> {
  const names: string[] = [];
  for await (const name of root.keys()) names.push(name);
  for (const name of names) {
    requireCondition(owns(), 'OWNERSHIP', '清除 OPFS 期间桌面控制权已失效');
    await root.removeEntry(name, { recursive: true });
  }
}
