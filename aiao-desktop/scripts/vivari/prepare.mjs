import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { gzipSync, gunzipSync } from 'node:zlib';

import manifest from './tools.json' with { type: 'json' };

export const VENDOR_TOOLS = manifest.tools;
export const VENDOR_DIRECTORY = fileURLToPath(new URL('../../../node_modules/.cache/aiao-desktop/vivari/vendor', import.meta.url));
const execute = promisify(execFile);

/** 校验 Vivari 专用 gzip 包的版本、索引、包信息和命令入口，拒绝缺失或损坏的资源。 */
export function validateVendorPack(bytes, tool) {
  const raw = gunzipSync(bytes);
  const headerLength = raw.readUInt32LE(0);
  const header = JSON.parse(raw.subarray(4, 4 + headerLength).toString('utf8'));
  if (header.version !== tool.version) throw new Error(`${tool.name} 版本不匹配：${header.version}，要求 ${tool.version}`);
  const start = 4 + headerLength;
  const files = new Map();
  for (const { p, o, l } of header.files) {
    if (!Number.isInteger(o) || !Number.isInteger(l) || o < 0 || l < 0 || start + o + l > raw.length)
      throw new Error(`${tool.name} 资源索引损坏：${p}`);
    files.set(p, raw.subarray(start + o, start + o + l));
  }
  if (!files.get(tool.entry)?.length) throw new Error(`${tool.name} 缺少命令入口：${tool.entry}`);
  const pkg = JSON.parse(files.get('package.json')?.toString('utf8') ?? 'null');
  if (pkg?.name !== tool.name || pkg.version !== tool.version)
    throw new Error(`${tool.name} 包信息或版本不匹配`);
}

/** 按 Vivari 1.3.0 的索引格式打包，保留原始字节并排除浏览器无法加载的原生扩展。 */
export async function packDirectory(directory, tool) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const paths = entries.filter(entry => entry.isFile() && !entry.name.endsWith('.node'))
    .map(entry => relative(directory, join(entry.parentPath, entry.name)).replaceAll('\\', '/')).sort();
  const contents = await Promise.all(paths.map(path => readFile(join(directory, path))));
  let offset = 0;
  const files = paths.map((path, index) => {
    const file = { p: path, o: offset, l: contents[index].length };
    offset += file.l;
    return file;
  });
  const header = Buffer.from(JSON.stringify({ version: tool.version, files }));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(header.length);
  const bytes = gzipSync(Buffer.concat([length, header, ...contents]), { level: 9 });
  validateVendorPack(bytes, tool);
  return bytes;
}

async function buildTool(outputDir, tool, fetchAsset) {
  const response = await fetchAsset(tool.tarball, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${tool.name} 下载失败：HTTP ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
  if (integrity !== tool.integrity) throw new Error(`${tool.name} 下载内容校验失败`);
  const scratch = await mkdtemp(join(tmpdir(), 'aiao-vivari-vendor-'));
  try {
    await writeFile(join(scratch, 'package.tgz'), archive);
    await mkdir(join(scratch, 'package'));
    await execute('tar', ['-xzf', join(scratch, 'package.tgz'), '-C', join(scratch, 'package'), '--strip-components=1']);
    const bytes = await packDirectory(join(scratch, 'package'), tool);
    const staged = join(outputDir, `${tool.name}-pack.${process.pid}.tmp`);
    await writeFile(staged, bytes);
    await rename(staged, join(outputDir, `${tool.name}-pack.bin`));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/** 从固定版本与 SHA-512 校验过的 npm 发布包生成同源资源；已有合格资源时可以离线构建。 */
export async function prepareVendor({ outputDir = VENDOR_DIRECTORY, tools = VENDOR_TOOLS, fetchAsset = fetch } = {}) {
  await mkdir(outputDir, { recursive: true });
  for (const tool of tools) {
    const cached = await readFile(join(outputDir, `${tool.name}-pack.bin`)).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (cached) validateVendorPack(cached, tool);
    else await buildTool(outputDir, tool, fetchAsset);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const require = createRequire(import.meta.url);
  const { version } = require('@vivari/core/package.json');
  if (version !== manifest.vivariVersion)
    throw new Error(`Vivari 版本 ${version} 与 vendor 清单 ${manifest.vivariVersion} 不匹配，先核对上游格式与工具版本`);
  await prepareVendor();
  console.log(`Vivari ${version} 包管理器资源就绪：${VENDOR_TOOLS.map(tool => `${tool.name}@${tool.version}`).join('、')}`);
}
