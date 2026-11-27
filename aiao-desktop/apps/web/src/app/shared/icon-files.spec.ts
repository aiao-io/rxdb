import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const web = join(import.meta.dirname, '../../..');
const icons = join(web, 'public/icons/desktop');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|html)$/.test(name) && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

/** 模板里写死的图标名（`appIcon="g-trash"`）；绑定表达式（`[appIcon]="…"`）在运行时才知道名字，不在这里查。 */
function literalIcons(): { name: string; file: string }[] {
  return sources(join(web, 'src')).flatMap(file =>
    [...readFileSync(file, 'utf8').matchAll(/(?<![[\w-])appIcon="([^"{}]+)"/g)].map(match => ({
      name: match[1],
      file: relative(web, file)
    }))
  );
}

describe('桌面图标文件', () => {
  it('模板里写死的每个图标名都有同名资源：缺了浏览器只会报 404，界面上是一块空白', () => {
    const found = literalIcons();
    expect(found.length).toBeGreaterThan(100);
    const missing = found.filter(
      ({ name }) => !existsSync(join(icons, `${name}.${name.startsWith('g-') ? 'svg' : 'png'}`))
    );
    expect(missing).toEqual([]);
  });
});
