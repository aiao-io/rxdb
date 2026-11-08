import type { RxDB } from '@aiao/rxdb';
import type { DesktopHostTransport } from '@aiao/rxdb-adapter-tauri';
import type { StorageFilesystem } from '@aiao/rxdb-plugin-storage';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const nativeBackend = true;
export const localAdapterName = 'sqlite-tauri';
let transport: Promise<DesktopHostTransport> | null = null;
async function sharedTransport(): Promise<DesktopHostTransport> {
  transport ??= import('@aiao/rxdb-adapter-tauri').then(({ createTauriHostTransport }) =>
    createTauriHostTransport({ invoke, listen, target: 'main' })
  );
  return transport;
}
/** 安装版业务请求使用固定产品域名，不在特权窗口加载远程页面。 */
export function apiEndpoint(path: string): string {
  const origin =
    (globalThis as { __AIAO_MEDIA_API_ORIGIN__?: string }).__AIAO_MEDIA_API_ORIGIN__ || 'https://media.aiao.io';
  return `${origin}${path}`;
}
/** 支付页交给系统浏览器，原生窗口保持本机来源。 */
export async function openPayment(url: string): Promise<void> {
  await invoke('media_open_payment', { url });
}
/** 清除 WebView 缓存后仍从原生目录恢复当前工作区，不新建空库。 */
export function initialProfile(candidate: string): Promise<string> {
  return invoke('media_profile', { candidate, update: false });
}
/** 工作区切换与备份恢复完成后提交原生指针。 */
export async function persistNativeProfile(profileId: string): Promise<void> {
  await invoke('media_profile', { candidate: profileId, update: true });
}
/** 数据库和原图共享受限的应用宿主传输。 */
export async function configureLocalAdapter(db: RxDB): Promise<void> {
  const { RxDBAdapterTauri } = await import('@aiao/rxdb-adapter-tauri');
  const channel = await sharedTransport();
  db.adapter(localAdapterName, host => new RxDBAdapterTauri(host, { transport: channel }));
}
/** 原图保存在应用数据目录，目录名与备份标识保持稳定。 */
export async function localFilesystem(rootDir: string): Promise<StorageFilesystem> {
  const { createDesktopStorageFilesystem } = await import('@aiao/rxdb-plugin-storage/desktop');
  return createDesktopStorageFilesystem({ transport: await sharedTransport() })(rootDir, { localAdapterName });
}
/** 原生标记和数据库位于同一持久域，清理 WebView 缓存不能绕过兼容守卫。 */
export async function nativeSchema(profileId: string, upgrade = false): Promise<void> {
  await invoke('media_schema', { profileId, upgrade });
}
/** 桌面链接通过保存对话框导出，取消或失败不虚报下载完成。 */
export async function interceptDownload(
  event: Event,
  url: string,
  name: string,
  source: () => Promise<Blob>
): Promise<void> {
  event.preventDefault();
  void url;
  await saveDownload(await source(), name);
}
/** 分块写入临时文件，确认完成后原子替换用户选择的目标。 */
export async function saveDownload(blob: Blob, name: string): Promise<boolean> {
  const token = await invoke<string | null>('media_begin_save', { name });
  if (!token) return false;
  try {
    for (let offset = 0; offset < blob.size; offset += 65536) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + 65536).arrayBuffer());
      await invoke('media_write_save', { token, bytes: Array.from(bytes) });
    }
    await invoke('media_finish_save', { token });
    return true;
  } catch (error) {
    await invoke('media_abort_save', { token }).catch(() => undefined);
    throw error;
  }
}
