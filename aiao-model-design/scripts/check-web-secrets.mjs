// 安全边界门禁：web 的构建产物里不能出现服务端密钥。
// 查两类：Trigger.dev 与模型供应商密钥的形状；本机环境文件（api 的 .dev.vars、agent 的 .env.agent）里密钥变量的取值。
// 报告只给文件与类型，不回显密钥本身。
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TEXT_FILE = /\.(?:js|mjs|cjs|css|html|json|txt|map|webmanifest|svg)$/;
const SHAPES = [
  { kind: 'Trigger.dev 密钥', pattern: /\btr_(?:dev|prod|stg|preview|pat)_[A-Za-z0-9]{16,}/ },
  { kind: '供应商 API 密钥', pattern: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/ }
];
const SECRET_NAME = /(?:KEY|SECRET|TOKEN|PASSWORD)$/;

async function* textFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* textFiles(file);
    else if (TEXT_FILE.test(entry.name)) yield file;
  }
}

async function secretValues(envFiles) {
  const values = [];
  for (const file of envFiles) {
    const source = await readFile(file, 'utf8').catch(error => (error.code === 'ENOENT' ? '' : Promise.reject(error)));
    for (const [, name, value] of source.matchAll(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/gm)) {
      if (SECRET_NAME.test(name) && value.length >= 12) values.push({ name, value });
    }
  }
  return values;
}

/**
 * 找出 web 构建产物里的服务端密钥。
 *
 * @param options.distDir web 的构建输出目录
 * @param options.envFiles 本机环境文件；不存在的跳过
 * @returns 命中的文件（相对 distDir）与类型，按文件名排序
 */
export async function findSecrets({ distDir, envFiles }) {
  const values = await secretValues(envFiles);
  const findings = [];
  for await (const file of textFiles(distDir)) {
    const content = await readFile(file, 'utf8');
    const relative = path.relative(distDir, file);
    for (const { kind, pattern } of SHAPES) if (pattern.test(content)) findings.push({ file: relative, kind });
    for (const { name, value } of values)
      if (content.includes(value)) findings.push({ file: relative, kind: `环境变量 ${name} 的取值` });
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.kind.localeCompare(b.kind));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const product = path.resolve(import.meta.dirname, '..');
  const distDir = path.resolve(product, '../dist/aiao-model-design/apps/web/browser');
  const findings = await findSecrets({
    distDir,
    envFiles: [path.join(product, 'apps/api/.dev.vars'), path.join(product, 'apps/agent/.env.agent')]
  });
  for (const { file, kind } of findings) console.error(`❌ ${file}: ${kind}`);
  if (findings.length) process.exit(1);
  console.log(`✅ web 构建产物里没有服务端密钥（${path.relative(process.cwd(), distDir)}）`);
}
