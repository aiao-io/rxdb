/** 已核验并与真实宿主一起发布的扩展目录。 */
export const MARKDOWN_EXTENSION = {
  id: 'shd101wyy.markdown-preview-enhanced',
  name: 'Markdown Preview Enhanced',
  publisher: 'shd101wyy',
  version: '0.8.40',
  browser: './out/web/extension.js'
} as const;

/** 安装操作独立于宿主的加载和激活状态。 */
export interface ExtensionInstallationState {
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly operation: 'installing' | 'uninstalling' | null;
  readonly error: string;
}

interface ManagementOptions {
  readonly storage: Pick<Storage, 'getItem' | 'setItem'>;
  prepare(signal: AbortSignal): Promise<void>;
  onChange(state: ExtensionInstallationState): void;
}

const prefix = `aiao-workbench:extensions:${MARKDOWN_EXTENSION.id}`;

function isInstallationRecord(value: unknown): value is Pick<ExtensionInstallationState, 'installed' | 'enabled'> {
  return typeof value === 'object' && value !== null && 'installed' in value && typeof value.installed === 'boolean' && 'enabled' in value && typeof value.enabled === 'boolean';
}

/** 安装记录先持久化再通知宿主；未完成的操作不改变已安装状态。 */
export function createExtensionManagement(options: ManagementOptions) {
  const saved: unknown = JSON.parse(options.storage.getItem(`${prefix}:installation`) ?? 'null');
  if (saved !== null && !isInstallationRecord(saved))
    throw new Error('扩展安装记录无效');
  let state: ExtensionInstallationState = {
    installed: saved === null || saved.installed,
    enabled: saved === null ? options.storage.getItem(`${prefix}:enabled`) !== 'false' : saved.installed && saved.enabled,
    operation: null,
    error: ''
  };
  let disposed = false;
  let pending: Promise<void> | undefined;
  const lifetime = new AbortController();

  function update(next: ExtensionInstallationState): void {
    state = next;
    options.onChange(state);
  }
  function commit(installed: boolean, enabled: boolean): void {
    options.storage.setItem(`${prefix}:installation`, JSON.stringify({ installed, enabled }));
    update({ installed, enabled, operation: null, error: '' });
  }
  function assertIdle(): void {
    if (disposed) throw new Error('扩展管理器已经释放');
    if (state.operation) throw new Error('扩展正在安装或卸载，请稍候');
  }
  function fail(error: unknown): never {
    update({ ...state, operation: null, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  function operate(operation: 'installing' | 'uninstalling', run: () => Promise<void>, installed: boolean): Promise<void> {
    update({ ...state, operation, error: '' });
    async function perform(): Promise<void> {
      await run();
      if (!disposed) commit(installed, installed);
    }
    pending = perform().catch(error => {
      if (!disposed) fail(error);
    }).finally(() => { pending = undefined; });
    return pending;
  }
  return {
    get state(): ExtensionInstallationState { return state; },
    install(): Promise<void> {
      if (state.operation === 'installing' && pending) return pending;
      try { assertIdle(); } catch (error) { return Promise.reject(error); }
      if (state.installed) return Promise.resolve();
      return operate('installing', () => options.prepare(lifetime.signal), true);
    },
    uninstall(): Promise<void> {
      if (state.operation === 'uninstalling' && pending) return pending;
      try { assertIdle(); } catch (error) { return Promise.reject(error); }
      if (!state.installed) return Promise.resolve();
      return operate('uninstalling', () => Promise.resolve(), false);
    },
    setEnabled(enabled: boolean): void {
      assertIdle();
      if (!state.installed) throw new Error('扩展未安装，请先安装');
      if (state.enabled === enabled) return;
      try { commit(true, enabled); } catch (error) { fail(error); }
    },
    dispose(): void { disposed = true; lifetime.abort(); }
  };
}

interface ExtensionAssets {
  readonly id: string;
  readonly version: string;
  readonly manifest: { readonly publisher: string; readonly name: string; readonly version: string; readonly browser: string };
  readonly files: readonly { readonly path: string; readonly bytes: number; readonly sha256: string }[];
}

/** 按部署资源根检查正式包清单和浏览器入口，不执行扩展代码。 */
export async function prepareMarkdownExtension(assetBase: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<void> {
  const base = new URL(`extensions/${MARKDOWN_EXTENSION.id}/`, assetBase);
  const metadata = await fetcher(new URL('extension-assets.json', base).href, { signal });
  if (!metadata.ok) throw new Error(`读取扩展安装清单失败：HTTP ${metadata.status}`);
  const assets: ExtensionAssets = await metadata.json();
  const manifest = assets.manifest;
  if (assets.id !== MARKDOWN_EXTENSION.id || assets.version !== MARKDOWN_EXTENSION.version || `${manifest?.publisher}.${manifest?.name}` !== MARKDOWN_EXTENSION.id || manifest?.version !== MARKDOWN_EXTENSION.version || manifest?.browser !== MARKDOWN_EXTENSION.browser)
    throw new Error('扩展安装清单与已验证版本不符');
  const path = MARKDOWN_EXTENSION.browser.slice(2);
  const entry = assets.files.find(file => file.path === path);
  if (!entry) throw new Error('扩展缺少浏览器入口');
  const response = await fetcher(new URL(path, base).href, { signal });
  if (!response.ok) throw new Error(`读取扩展浏览器入口失败：HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (bytes.byteLength !== entry.bytes || sha256 !== entry.sha256) throw new Error('扩展浏览器入口完整性校验失败');
}
