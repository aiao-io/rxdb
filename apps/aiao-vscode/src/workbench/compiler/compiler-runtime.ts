import { workbenchImportMap } from '../assets.js';

/** 经固定清单和内容摘要验证的运行时快照。 */
export interface RuntimeBundle {
  runtimeFiles: Readonly<Record<string, string>>;
  runtimeImports: Readonly<Record<string, string>>;
}

interface RuntimeAsset {
  path: string;
  bytes: number;
  sha256: string;
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function manifestAssets(value: unknown): RuntimeAsset[] {
  if (!Array.isArray(value)) throw new Error('运行时 manifest 资源清单无效');
  const paths = new Set<string>();
  return value.map(item => {
    const entry = record(item, '运行时 manifest 资源条目无效');
    const path = entry['path'];
    if (
      typeof path !== 'string' ||
      !/^[A-Za-z0-9_./-]+$/.test(path) ||
      path.startsWith('/') ||
      path.split('/').some(part => !part || part === '.' || part === '..') ||
      paths.has(path)
    )
      throw new Error('运行时 manifest 存在重复或越界路径');
    if (
      typeof entry['bytes'] !== 'number' ||
      !Number.isSafeInteger(entry['bytes']) ||
      entry['bytes'] < 0 ||
      typeof entry['sha256'] !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry['sha256'])
    )
      throw new Error(`运行时 manifest 摘要或长度无效：${path}`);
    paths.add(path);
    return { path, bytes: entry['bytes'], sha256: entry['sha256'] };
  });
}

async function response(url: URL, signal?: AbortSignal): Promise<Response> {
  const result = await fetch(url.href, { credentials: 'omit', redirect: 'error', signal });
  if (!result.ok) throw new Error(`运行时资源未缓存或不可用：${url.pathname}`);
  return result;
}

async function verifiedSource(base: URL, asset: RuntimeAsset, signal?: AbortSignal): Promise<[string, string]> {
  const bytes = await (await response(new URL(asset.path, base), signal)).arrayBuffer();
  if (bytes.byteLength !== asset.bytes) throw new Error(`运行时资源长度不匹配：${asset.path}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hex !== asset.sha256) throw new Error(`运行时资源 SHA-256 不匹配：${asset.path}`);
  return [asset.path, new TextDecoder('utf-8', { fatal: true }).decode(bytes)];
}

/** 在父页面读取缓存资源，随后把可信代码交给编译 Worker 内联。 */
export async function loadRuntimeBundle(base: URL, signal?: AbortSignal): Promise<RuntimeBundle> {
  const manifest = record(
    await (await response(new URL('manifest.json', base), signal)).json(),
    '运行时 manifest 无效'
  );
  if (manifest['version'] !== 1) throw new Error('运行时 manifest 版本不受支持');
  const modules = record(manifest['modules'], '运行时 manifest 依赖映射无效');
  const fixed = workbenchImportMap(base.href);
  const imports = Object.entries(fixed).map(([specifier, url]) => {
    const filename = new URL(url).pathname.split('/').at(-1)?.slice(0, -3);
    if (!filename || modules[filename] !== specifier) throw new Error(`运行时 manifest 依赖映射不匹配：${specifier}`);
    return [specifier, `runtime/${filename}.js`] as const;
  });
  if (Object.keys(modules).length !== imports.length) throw new Error('运行时 manifest 包含未知依赖映射');
  const assets = manifestAssets(manifest['assets']).filter(
    asset => asset.path.startsWith('runtime/') && asset.path.endsWith('.js')
  );
  if (assets.length > 512) throw new Error('运行时资源超过 512 项上限');
  if (assets.reduce((total, asset) => total + asset.bytes, 0) > 32 * 1024 * 1024)
    throw new Error('运行时资源超过 32 MiB 上限');
  const paths = new Set(assets.map(asset => asset.path));
  for (const [, path] of imports) if (!paths.has(path)) throw new Error(`运行时入口未缓存：${path}`);
  const files = await Promise.all(assets.map(asset => verifiedSource(base, asset, signal)));
  return { runtimeFiles: Object.fromEntries(files), runtimeImports: Object.fromEntries(imports) };
}
