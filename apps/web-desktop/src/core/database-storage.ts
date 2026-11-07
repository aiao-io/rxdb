import { isRecord } from './catalog.js';
import { requireCondition } from './errors.js';
import { migrateState } from './layout.js';
import { createState } from './state.js';
import type { DesktopState, Mode } from './types.js';

type PreviousBytes = Map<string, string> | null;
type Loaded = (state: DesktopState, previous: PreviousBytes) => void;

export function readStoredDesktop(
  store: IDBObjectStore,
  value: unknown,
  mode: Mode,
  loaded: Loaded,
  failed: (error: unknown) => void
): void {
  if (value === undefined) {
    const count = store.count();
    count.onsuccess = () => {
      try {
        requireCondition(count.result === 0, 'INVALID', '桌面元数据缺失，原始文件记录已保留');
        loaded(createState(mode), null);
      } catch (error) {
        failed(error);
      }
    };
    return;
  }
  if (!isRecord(value) || !('storageVersion' in value)) {
    loaded(migrateState(value), null);
    return;
  }
  requireCondition(
    value['storageVersion'] === 1 &&
      Object.keys(value).every(key => key === 'storageVersion' || key === 'data') &&
      isRecord(value['data']),
    'INVALID',
    '不支持的桌面存储格式，原始记录已保留'
  );
  const data = value['data'];
  const files = data['files'];
  requireCondition(
    Array.isArray(files) && files.every(file => isRecord(file) && typeof file['id'] === 'string' && !('bytes' in file)),
    'INVALID',
    '文件元数据无效，原始记录已保留'
  );
  const restored: Record<string, unknown>[] = new Array(files.length);
  let remaining = files.length;
  const finish = () => {
    const state = migrateState({ ...data, files: restored });
    loaded(state, new Map(state.files.map(file => [file.id, file.bytes])));
  };
  if (remaining === 0) finish();
  files.forEach((file, index) => {
    const request = store.get(`file:${file['id']}`);
    request.onsuccess = () => {
      try {
        requireCondition(typeof request.result === 'string', 'INVALID', '文件字节缺失或受损，原始记录已保留');
        restored[index] = { ...file, bytes: request.result };
        if (--remaining === 0) finish();
      } catch (error) {
        failed(error);
      }
    };
  });
}

export function writeStoredDesktop(
  store: IDBObjectStore,
  state: DesktopState,
  previous: PreviousBytes
): IDBRequest<IDBValidKey> {
  if (previous === null) store.clear();
  const ids = new Set(state.files.map(file => file.id));
  for (const id of previous?.keys() ?? []) if (!ids.has(id)) store.delete(`file:${id}`);
  for (const file of state.files) if (previous?.get(file.id) !== file.bytes) store.put(file.bytes, `file:${file.id}`);
  const data = { ...state, files: state.files.map(({ bytes: _bytes, ...file }) => file) };
  return store.put({ storageVersion: 1, data }, 'desktop');
}
