import { decodedByteLength, digest } from './bytes.js';
import { isRecord } from './catalog.js';
import { requireCondition } from './errors.js';
import { MAX_IMPORT_BYTES } from './files.js';
import { migrateState } from './layout.js';
import type { DesktopState } from './types.js';

export interface DesktopBackup {
  format: 'orbit-desktop';
  schemaVersion: 1;
  unencrypted: true;
  createdAt: string;
  data: DesktopState;
  checksum: string;
}

function checkSize(state: DesktopState, limit: number): void {
  const size = state.files.reduce((total, file) => total + decodedByteLength(file.bytes), 0);
  requireCondition(size <= limit, 'LIMIT', '备份文件字节超过 200 MiB，请缩小范围');
}

export async function exportBackup(state: DesktopState, limit = MAX_IMPORT_BYTES): Promise<DesktopBackup> {
  checkSize(state, limit);
  const data = structuredClone(state);
  data.grants = [];
  const checksum = await digest(new TextEncoder().encode(JSON.stringify(data)));
  return {
    format: 'orbit-desktop',
    schemaVersion: 1,
    unencrypted: true,
    createdAt: new Date().toISOString(),
    data,
    checksum
  };
}

export async function validateBackup(value: unknown, limit = MAX_IMPORT_BYTES): Promise<DesktopState> {
  requireCondition(
    isRecord(value) &&
      value['format'] === 'orbit-desktop' &&
      value['schemaVersion'] === 1 &&
      value['unencrypted'] === true &&
      isRecord(value['data']) &&
      typeof value['checksum'] === 'string',
    'INVALID',
    '不是受支持的桌面备份'
  );
  const checksum = await digest(new TextEncoder().encode(JSON.stringify(value['data'])));
  requireCondition(checksum === value['checksum'], 'INTEGRITY', '备份校验失败，当前数据未改变');
  const data = structuredClone(migrateState(value['data']));
  checkSize(data, limit);
  data.grants = [];
  return data;
}
