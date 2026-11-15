import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { VENDOR_DIRECTORY, withVendorArchive } from './prepare.mjs';
import manifest from './runtimes.json' with { type: 'json' };

export const RUNTIME_ASSETS = [...manifest.archives.flatMap(archive => archive.files), ...manifest.files];

function validate(bytes, asset) {
  if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
    throw new Error(`${asset.path} 内容校验失败`);
}

async function cached(outputDir, asset) {
  const bytes = await readFile(join(outputDir, asset.path)).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (bytes) validate(bytes, asset);
  return bytes !== null;
}

async function store(outputDir, asset, bytes) {
  validate(bytes, asset);
  const destination = join(outputDir, asset.path);
  await mkdir(dirname(destination), { recursive: true });
  const staged = `${destination}.${process.pid}.tmp`;
  await writeFile(staged, bytes);
  await rename(staged, destination);
}

async function prepareArchive(outputDir, archive, fetchAsset) {
  const missing = [];
  for (const asset of archive.files) {
    if (!await cached(outputDir, asset)) missing.push(asset);
  }
  if (missing.length === 0) return;
  await withVendorArchive(archive, fetchAsset, async directory => {
    for (const asset of missing) await store(outputDir, asset, await readFile(join(directory, asset.source)));
  });
}

async function prepareFile(outputDir, asset, fetchAsset) {
  if (await cached(outputDir, asset)) return;
  if (asset.source) {
    await store(outputDir, asset, await readFile(new URL(asset.source, import.meta.url)));
    return;
  }
  const response = await fetchAsset(asset.url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${asset.path} 下载失败：HTTP ${response.status}`);
  await store(outputDir, asset, Buffer.from(await response.arrayBuffer()));
}

/** 托管固定版本的 Python、Ruff 和 SQLite；逐文件验散列，只在首次使用命令时由浏览器加载。 */
export async function prepareRuntimes({ outputDir = VENDOR_DIRECTORY, archives = manifest.archives, files = manifest.files, fetchAsset = fetch } = {}) {
  for (const archive of archives) await prepareArchive(outputDir, archive, fetchAsset);
  for (let index = 0; index < files.length; index += 4) {
    const results = await Promise.allSettled(files.slice(index, index + 4).map(asset => prepareFile(outputDir, asset, fetchAsset)));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
}

/** 发布前逐文件验散列，缺失、HTML 替身和损坏的 WASM / wheel 都不能通过。 */
export async function runtimeProblems(outputDir, assets = RUNTIME_ASSETS) {
  const problems = [];
  for (const asset of assets) {
    try {
      if (!await cached(outputDir, asset)) problems.push(`${asset.path} 缺失，终端运行时无法首次加载`);
    } catch (error) {
      problems.push(`${asset.path} 无效：${error.message}`);
    }
  }
  return problems;
}
