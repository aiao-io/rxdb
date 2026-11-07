import type { Page } from '@playwright/test';
import type { DesktopState } from '../src/core/types.js';

interface FileInfo {
  id: string;
  name: string;
  mime: string;
  size: number;
  revision: number;
  sha256: string;
}

export async function inspectStoredState(
  checksums: boolean | null
): Promise<{ state: DesktopState | null; files: FileInfo[] }> {
  const state = await new Promise<DesktopState>((resolve, reject) => {
    const request = indexedDB.open('orbit-desktop', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const tx = database.transaction('state', 'readonly');
      const store = tx.objectStore('state');
      const read = store.get('desktop');
      let result: DesktopState;
      read.onsuccess = () => {
        const value = read.result;
        if (value?.storageVersion !== 1) {
          result = value;
          return;
        }
        result = value.data;
        result.files = result.files.map(file => ({ ...file }));
        for (const file of result.files) {
          const bytes = store.get(`file:${file.id}`);
          bytes.onsuccess = () => {
            file.bytes = bytes.result;
          };
        }
      };
      tx.oncomplete = () => {
        database.close();
        resolve(result);
      };
      tx.onabort = () => {
        database.close();
        reject(tx.error);
      };
    };
  });
  if (checksums === null) return { state, files: [] };
  async function hashBytes(value: string): Promise<string> {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  const files: FileInfo[] = [];
  for (const file of state.files) {
    const padding = file.bytes.endsWith('==') ? 2 : Number(file.bytes.endsWith('='));
    files.push({
      id: file.id,
      name: file.name,
      mime: file.mime,
      size: (file.bytes.length / 4) * 3 - padding,
      revision: file.revision,
      sha256: checksums ? await hashBytes(file.bytes) : ''
    });
  }
  return { state: null, files };
}

export async function readState(page: Page): Promise<DesktopState> {
  return (await page.evaluate(inspectStoredState, null)).state!;
}

export async function fileInfo(page: Page, checksums = false): Promise<FileInfo[]> {
  return (await page.evaluate(inspectStoredState, checksums)).files;
}
