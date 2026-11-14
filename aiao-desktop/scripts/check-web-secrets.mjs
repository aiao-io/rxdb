// 安全边界门禁：web 的构建产物里不能出现密钥。本产品没有服务端，任何密钥形状的字符串出现在产物里都是泄漏。
// 报告只给文件与类型，不回显密钥本身。
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TEXT_FILE = /\.(?:js|mjs|cjs|css|html|json|txt|map|webmanifest|svg)$/;
const SHAPES = [
  { kind: '模型供应商 API 密钥', pattern: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/ },
  { kind: 'GitHub 令牌', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/ },
  { kind: 'AWS 访问密钥', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: '私钥', pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
  { kind: 'Supabase 服务端密钥', pattern: /\bsb_secret_[A-Za-z0-9_-]{16,}/ }
];

async function* textFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* textFiles(file);
    else if (TEXT_FILE.test(entry.name)) yield file;
  }
}

/**
 * 扫描 web 构建产物里的密钥形状。
 *
 * @param options.distDir web 的构建输出目录；不存在时抛出 `ENOENT`，不当作通过
 * @returns 扫过的文本文件数，与命中的文件（相对 distDir，`/` 分隔）和类型，按文件名排序
 */
export async function scanBuild({ distDir }) {
  const findings = [];
  let filesScanned = 0;
  for await (const file of textFiles(distDir)) {
    filesScanned += 1;
    const content = await readFile(file, 'utf8');
    const relative = path.relative(distDir, file).split(path.sep).join('/');
    for (const { kind, pattern } of SHAPES) if (pattern.test(content)) findings.push({ file: relative, kind });
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.kind.localeCompare(b.kind));
  return { filesScanned, findings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const distDir = path.resolve(import.meta.dirname, '../../dist/aiao-desktop/apps/web/browser');
  const { filesScanned, findings } = await scanBuild({ distDir });
  const shown = path.relative(process.cwd(), distDir);
  for (const { file, kind } of findings) console.error(`❌ ${file}: ${kind}`);
  if (filesScanned === 0) console.error(`❌ ${shown} 里没有可扫描的文本文件，先构建 aiao-desktop-web`);
  if (findings.length || filesScanned === 0) process.exit(1);
  console.log(`✅ web 构建产物里没有密钥（${shown}，${filesScanned} 个文本文件）`);
}
