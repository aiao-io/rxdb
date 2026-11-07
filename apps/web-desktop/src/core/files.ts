import { decodedByteLength } from './bytes.js';
import { requireCondition } from './errors.js';
import type { DesktopState, VirtualFile } from './types.js';

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_IMPORT_COUNT = 100;
export const MAX_IMPORT_BYTES = 200 * 1024 * 1024;
export interface FileInput {
  name: string;
  parentId?: string | null;
  kind?: 'file' | 'directory';
  mime?: string;
  bytes?: string;
}

export interface ImportInput extends FileInput {
  resolution?: 'skip' | 'keep' | 'replace';
  revision?: number;
}

export function validateName(name: string): void {
  requireCondition(
    typeof name === 'string' &&
      name.trim().length > 0 &&
      name.length <= 255 &&
      !['.', '..'].includes(name) &&
      !/[\\/]/u.test(name) &&
      !Array.from(name).some(char => char.charCodeAt(0) < 32),
    'INVALID',
    '名称须为 1–255 字符且不能包含路径分隔符'
  );
}

export function findFile(state: DesktopState, id: string): VirtualFile {
  const file = state.files.find(file => file.id === id);
  requireCondition(file, 'NOT_FOUND', '文件不存在');
  return file;
}

export function readFile(state: DesktopState, id: string): VirtualFile {
  const file = findFile(state, id);
  requireCondition(!file.deleted, 'TRASHED', '文件在回收站，请先恢复或另存为');
  return file;
}

function validateParent(state: DesktopState, parentId: string | null): void {
  if (parentId === null) return;
  requireCondition(readFile(state, parentId).kind === 'directory', 'INVALID', '目标不是目录');
}

function uniqueName(state: DesktopState, parentId: string | null, name: string, exclude?: string): void {
  validateName(name);
  requireCondition(
    !state.files.some(file => !file.deleted && file.parentId === parentId && file.name === name && file.id !== exclude),
    'EXISTS',
    '目标目录已有同名文件'
  );
}

export function listFiles(
  state: DesktopState,
  parentId: string | null = null,
  search = '',
  trash = false
): VirtualFile[] {
  return state.files.filter(
    file =>
      file.deleted === trash &&
      (trash || file.parentId === parentId) &&
      file.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  );
}

export function createFile(state: DesktopState, input: FileInput): VirtualFile {
  const parentId = input.parentId ?? null;
  validateParent(state, parentId);
  uniqueName(state, parentId, input.name);
  decodedByteLength(input.bytes ?? '');
  requireCondition(!input.kind || ['file', 'directory'].includes(input.kind), 'INVALID', '文件类型无效');
  const file: VirtualFile = {
    id: crypto.randomUUID(),
    name: input.name,
    parentId,
    kind: input.kind ?? 'file',
    mime: input.mime ?? 'text/plain',
    bytes: input.bytes ?? '',
    revision: 1,
    modified: Date.now(),
    trashId: null,
    deleted: false
  };
  requireCondition(file.kind !== 'directory' || file.bytes === '', 'INVALID', '目录不能包含文件字节');
  state.files.push(file);
  return file;
}

function touch(file: VirtualFile): void {
  file.revision++;
  file.modified = Date.now();
}

export function writeFile(state: DesktopState, id: string, revision: number, bytes: string): VirtualFile {
  const file = readFile(state, id);
  requireCondition(file.kind === 'file', 'INVALID', '不能向目录写入内容');
  requireCondition(file.revision === revision, 'CONFLICT', '文件已有更新，请重新加载或另存为');
  decodedByteLength(bytes);
  file.bytes = bytes;
  touch(file);
  return file;
}

export function renameFile(state: DesktopState, id: string, name: string): VirtualFile {
  const file = readFile(state, id);
  uniqueName(state, file.parentId, name, id);
  file.name = name;
  touch(file);
  return file;
}

function descendants(state: DesktopState, id: string): VirtualFile[] {
  const result = [findFile(state, id)];
  for (let i = 0; i < result.length; i++) result.push(...state.files.filter(file => file.parentId === result[i].id));
  return result;
}

export function moveFile(state: DesktopState, id: string, parentId: string | null): VirtualFile {
  const file = readFile(state, id);
  validateParent(state, parentId);
  requireCondition(!descendants(state, id).some(file => file.id === parentId), 'INVALID', '目录不能移入自身或子目录');
  uniqueName(state, parentId, file.name, id);
  file.parentId = parentId;
  touch(file);
  return file;
}

export function trashFile(state: DesktopState, id: string): void {
  readFile(state, id);
  for (const file of descendants(state, id).filter(file => !file.deleted)) {
    file.trashId = id;
    file.deleted = true;
    touch(file);
  }
}

export function restoreFile(state: DesktopState, id: string, target?: string | null, name?: string): VirtualFile {
  const file = findFile(state, id);
  requireCondition(file.deleted, 'INVALID', '文件不在回收站');
  const parentId = target === undefined ? file.parentId : target;
  validateParent(state, parentId);
  uniqueName(state, parentId, name ?? file.name, id);
  file.name = name ?? file.name;
  file.parentId = parentId;
  for (const entry of descendants(state, id).filter(entry => entry.trashId === file.trashId)) {
    entry.trashId = null;
    entry.deleted = false;
    touch(entry);
  }
  return file;
}

export function deleteFile(state: DesktopState, id: string): void {
  requireCondition(findFile(state, id).deleted, 'INVALID', '永久删除前须移入回收站');
  const ids = new Set(descendants(state, id).map(file => file.id));
  state.files = state.files.filter(file => !ids.has(file.id));
}

export function emptyTrash(state: DesktopState): number {
  const count = state.files.filter(file => file.deleted).length;
  state.files = state.files.filter(file => !file.deleted);
  return count;
}

export function validateImport(inputs: FileInput[], limit = MAX_IMPORT_BYTES): void {
  const sizes = inputs.map(input => decodedByteLength(input.bytes ?? ''));
  requireCondition(
    inputs.length <= MAX_IMPORT_COUNT &&
      sizes.every(size => size <= MAX_FILE_BYTES) &&
      sizes.reduce((sum, size) => sum + size, 0) <= limit,
    'LIMIT',
    '单文件最多 50 MiB，每批最多 100 个文件、200 MiB'
  );
}

export function importFiles(state: DesktopState, inputs: ImportInput[], limit = MAX_IMPORT_BYTES): VirtualFile[] {
  validateImport(inputs, limit);
  const draft = { ...state, files: structuredClone(state.files) };
  const result = inputs.flatMap(input => importOne(draft, input));
  state.files = draft.files;
  return result;
}

function importOne(state: DesktopState, input: ImportInput): VirtualFile[] {
  validateName(input.name);
  const existing = state.files.find(
    file => !file.deleted && file.parentId === (input.parentId ?? null) && file.name === input.name
  );
  if (existing && input.resolution === 'skip') return [];
  if (input.resolution === 'replace') {
    requireCondition(existing && existing.revision === input.revision, 'CONFLICT', '替换目标已有变化，请重新选择');
    const result = writeFile(state, existing.id, existing.revision, input.bytes ?? '');
    result.mime = input.mime ?? result.mime;
    return [result];
  }
  const name =
    existing && input.resolution === 'keep' ? availableName(state, input.parentId ?? null, input.name) : input.name;
  return [createFile(state, { ...input, name })];
}

function availableName(state: DesktopState, parentId: string | null, original: string): string {
  const dot = original.lastIndexOf('.');
  const stem = dot > 0 ? original.slice(0, dot) : original;
  const extension = dot > 0 ? original.slice(dot) : '';
  let index = 2;
  let name = original;
  const names = new Set(state.files.filter(file => !file.deleted && file.parentId === parentId).map(file => file.name));
  while (names.has(name)) {
    const suffix = ` (${index++})${extension}`;
    name = `${stem.slice(0, 255 - suffix.length)}${suffix}`;
  }
  return name;
}
