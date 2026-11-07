import type { RxDB } from '@aiao/rxdb';
import type { StorageFilesystem } from '@aiao/rxdb-plugin-storage';

export const nativeBackend = false;
export const localAdapterName = 'wa-sqlite';
/** Web 业务 API 使用同源入口。 */
export function apiEndpoint(path: string): string {
  return path;
}
/** Web 支付在当前浏览器打开受验证的结算页。 */
export function openPayment(url: string): Promise<void> {
  location.assign(url);
  return Promise.resolve();
}
/** 浏览器继续沿用既有工作区标识。 */
export function initialProfile(candidate: string): Promise<string> {
  return Promise.resolve(candidate);
}
/** 浏览器指针由现有本机注册表和存储键维护。 */
export function persistNativeProfile(profileId: string): Promise<void> {
  void profileId;
  return Promise.resolve();
}
/** 浏览器构建只注册浏览器数据库，不加载原生桥接。 */
export async function configureLocalAdapter(db: RxDB): Promise<void> {
  const { RxDBAdapterWaSqlite } = await import('@aiao/rxdb-adapter-wa-sqlite');
  db.adapter(
    localAdapterName,
    host =>
      new RxDBAdapterWaSqlite(host, {
        vfs: 'IDBBatchAtomicVFS',
        async: true,
        wasmPath: '/wa-sqlite/wa-sqlite-async.wasm'
      })
  );
}
/** 原图根标识沿用现有 OPFS 布局。 */
export async function localFilesystem(rootDir: string): Promise<StorageFilesystem> {
  const { OpfsStorageFilesystem } = await import('@aiao/rxdb-plugin-storage');
  return new OpfsStorageFilesystem(rootDir);
}
/** 浏览器兼容标记由工作区锁内的现有存储维护。 */
export function nativeSchema(_profileId: string, _upgrade = false): Promise<void> {
  void [_profileId, _upgrade];
  return Promise.resolve();
}
/** 浏览器文件下载由原生链接处理。 */
export function interceptDownload(
  _event: Event,
  _url: string,
  _name: string,
  _source: () => Promise<Blob>
): Promise<void> {
  void [_event, _url, _name, _source];
  return Promise.resolve();
}
/** 浏览器通过下载链接导出本机备份。 */
export async function saveDownload(blob: Blob, name: string): Promise<boolean> {
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return true;
}
