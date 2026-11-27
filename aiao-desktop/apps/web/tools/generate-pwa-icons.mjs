import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const store = resolve(import.meta.dirname, '../../../../node_modules/.pnpm');
const sharpDirectory = readdirSync(store).find(name => name.startsWith('sharp@'));
if (!sharpDirectory) throw new Error('pnpm store 中找不到 sharp');
const sharp = createRequire(import.meta.url)(join(store, sharpDirectory, 'node_modules/sharp'));
const icons = resolve(import.meta.dirname, '../public/icons');
const source = readFileSync(join(icons, 'desktop.svg'));
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180]
]) {
  await sharp(source).resize(size, size).png().toFile(join(icons, name));
}
