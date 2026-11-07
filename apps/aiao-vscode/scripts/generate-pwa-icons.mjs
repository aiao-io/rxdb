/**
 * @fileoverview 生成 PWA 安装图标（192/512 常规 + 512 maskable）。
 *
 * 从 pnpm store 动态解析 sharp，避免把间接依赖写进 package.json。
 */
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const store = path.resolve(import.meta.dirname, '../../..', 'node_modules/.pnpm');
const sharpDir = readdirSync(store).find(name => name.startsWith('sharp@'));
if (!sharpDir) throw new Error('pnpm store 中找不到 sharp');
const sharp = require(path.join(store, sharpDir, 'node_modules/sharp'));

const glyph = `
  <path d="M216 172 L136 256 L216 340" />
  <path d="M296 172 L376 256 L296 340" />
  <path d="M304 340 L208 172" />`;
const svg = rounded => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 96 : 0}" fill="#0078d4"/>
  <g fill="none" stroke="#ffffff" stroke-width="40" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
</svg>`;

const targets = [
  ['icons/icon-192.png', 192, true],
  ['icons/icon-512.png', 512, true],
  ['icons/icon-maskable-512.png', 512, false]
];
for (const [file, size, rounded] of targets) {
  const output = path.resolve(import.meta.dirname, '../public', file);
  await sharp(Buffer.from(svg(rounded)))
    .resize(size, size)
    .png()
    .toFile(output);
  console.log(`generated ${file}`);
}
