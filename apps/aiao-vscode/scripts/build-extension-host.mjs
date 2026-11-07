import { build } from 'esbuild';
import { unzipSync } from 'fflate';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(appRoot, 'package.json'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function download(lock, cache) {
  console.log(`首次构建下载 Markdown 扩展（${(lock.bytes / 1e6).toFixed(1)} MB）：${lock.url} → ${cache}`);
  try {
    const response = await fetch(lock.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  } catch (cause) {
    throw new Error(
      `下载 Markdown 扩展失败：直连 GitHub 不通时设代理重跑（NODE_USE_ENV_PROXY=1 HTTPS_PROXY=<代理地址>），或手动下载 ${lock.url} 放到 ${cache}`,
      { cause }
    );
  }
}

async function prepareExtension(output) {
  const lock = JSON.parse(await readFile(join(appRoot, 'vendor/markdown-preview-enhanced.lock.json'), 'utf8'));
  const cache = join(homedir(), '.cache/aiao-vscode/extensions', `${lock.id}-${lock.version}.vsix`);
  await mkdir(dirname(cache), { recursive: true });
  let archive;
  try {
    archive = await readFile(cache);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    archive = await download(lock, cache);
    if (archive.length !== lock.bytes || digest(archive) !== lock.sha256)
      throw new Error('Markdown 扩展完整性校验失败', { cause: error });
    const partial = `${cache}.${process.pid}.tmp`;
    await writeFile(partial, archive);
    await rename(partial, cache);
  }
  if (archive.length !== lock.bytes || digest(archive) !== lock.sha256) throw new Error('Markdown 扩展完整性校验失败');
  const entries = unzipSync(archive);
  const manifest = JSON.parse(new TextDecoder().decode(entries['extension/package.json']));
  if (
    `${manifest.publisher}.${manifest.name}` !== lock.id ||
    manifest.version !== lock.version ||
    manifest.browser !== lock.browser
  )
    throw new Error('Markdown 扩展发布清单与版本锁定不符');
  const browserPath = `extension/${manifest.browser.replace(/^\.\//, '')}`;
  const originalEntry = new TextDecoder().decode(entries[browserPath]);
  const matches = [...originalEntry.matchAll(/[\w$]+\.Uri\.file\(this\.context\.extensionPath\)/g)];
  if (matches.length !== 1) throw new Error('Markdown 扩展资源根适配点发生变化');
  entries[browserPath] = new TextEncoder().encode(originalEntry.replace(matches[0][0], 'this.context.extensionUri'));
  const adaptations = [
    {
      id: 'webview-extension-uri-root',
      sourceSha256: digest(Buffer.from(originalEntry)),
      sha256: digest(entries[browserPath]),
      reason: 'Webview 扩展资源根使用真实 extensionUri，保持浏览器宿主的 URI scheme 与 authority。'
    }
  ];
  const files = [];
  const target = join(output, 'extensions', lock.id);
  for (const [name, content] of Object.entries(entries)) {
    if (!name.startsWith('extension/')) continue;
    const path = name.slice('extension/'.length);
    if (!path || name.endsWith('/')) continue;
    if (path.split('/').some(part => part === '..' || part === '.' || part.includes('\\')))
      throw new Error(`非法扩展资源路径：${name}`);
    const destination = join(target, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
    files.push({ path, bytes: content.length, sha256: digest(content) });
  }
  const translations = Object.assign(
    {},
    ...['extension/package.nls.json', 'extension/package.nls.zh-cn.json'].map(path =>
      JSON.parse(new TextDecoder().decode(entries[path]))
    )
  );
  const metadata = { ...lock, manifest, translations, files, adaptations };
  const metadataPath = join(target, 'extension-assets.json');
  await writeFile(metadataPath, JSON.stringify(metadata));
  return [metadataPath, ...files.map(file => join(target, file.path))];
}

export async function buildExtensionHost(output) {
  const outdir = join(output, 'extension-host');
  await mkdir(outdir, { recursive: true });
  const nativeAssets = new Map();
  const results = await build({
    entryPoints: {
      host: join(appRoot, 'extension-host/runtime.ts'),
      'editor-worker': require.resolve('@codingame/monaco-vscode-api/workers/editor.worker')
    },
    outdir,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    external: ['node:*'],
    target: 'es2022',
    minify: true,
    sourcemap: false,
    metafile: true,
    legalComments: 'external',
    loader: { '.ttf': 'file', '.woff': 'file', '.woff2': 'file', '.svg': 'file', '.png': 'file' },
    plugins: [
      {
        name: 'vscode-native-assets',
        setup(builder) {
          builder.onLoad({ filter: /@codingame.*\.js$/ }, async args => {
            let text = await readFile(args.path, 'utf8');
            const matches = [...text.matchAll(/new URL\((['"])(\.[^'"]+)\1,\s*import\.meta\.url\)/g)];
            for (const match of matches) {
              const source = resolve(dirname(args.path), match[2]);
              const info = await stat(source).catch(() => undefined);
              if (!info?.isFile()) continue;
              const folder = `native-assets/${digest(Buffer.from(dirname(source).split('/node_modules/').at(-1))).slice(0, 12)}`;
              for (const file of await readdir(dirname(source), { withFileTypes: true })) {
                if (file.isFile()) nativeAssets.set(join(dirname(source), file.name), join(outdir, folder, file.name));
              }
              text = text.replace(
                match[0],
                `new URL(${JSON.stringify(`./${folder}/${basename(source)}`)},import.meta.url)`
              );
            }
            return { contents: text, loader: 'js', resolveDir: dirname(args.path) };
          });
        }
      }
    ]
  });
  for (const [source, target] of nativeAssets) {
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  const html = join(outdir, 'index.html');
  await writeFile(
    html,
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Markdown Preview Enhanced</title><link rel="stylesheet" href="host.css"></head><body><div id="source"></div><main id="editors" aria-label="Markdown 插件预览"></main><div id="status" role="status">正在启动 Markdown 扩展…</div><script type="module" src="host.js"></script></body></html>'
  );
  const css = join(outdir, 'host-shell.css');
  await writeFile(
    css,
    'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#1e1e1e;color:#ccc}#editors{position:absolute;inset:0}#source{position:absolute;left:-10000px;width:800px;height:600px}#status{position:absolute;inset:0;padding:20px;font:13px system-ui;z-index:100;background:#1e1e1e}#status:empty{display:none}'
  );
  const hostCSS = join(outdir, 'host.css');
  await writeFile(hostCSS, `${await readFile(hostCSS, 'utf8')}\n${await readFile(css, 'utf8')}`);
  const extensionAssets = await prepareExtension(output);
  const paths = [
    ...Object.keys(results.metafile.outputs).map(path => resolve(path)),
    html,
    css,
    ...nativeAssets.values(),
    ...extensionAssets
  ];
  const license = join(outdir, 'LICENSE.monaco-vscode-api.txt');
  await copyFile(join(appRoot, 'vendor/monaco-vscode-api-LICENSE.txt'), license);
  paths.push(license);
  return paths.map(path => relative(output, path));
}
