import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DESKTOP_APP_MANIFESTS } from '../apps/app-manifests';
import { DESKTOP_MESSAGES_EN } from './messages-en';
import { DESKTOP_MESSAGES_ZH } from './messages-zh';

/**
 * ADESK-US-132 阶段 2 门禁：源码里每个经 t() 使用的目录 key 都必须同时存在于中英目录。
 * 静态扫描 src/app（排除 spec 与目录文件自身）；t(key) 全链未命中的运行时行为是原样返回
 * key 本身，界面会直接露出英文键名，所以这道门禁把「漏登记」挡在提交前。
 */
const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url));

const usedKeys = (): Set<string> => {
  const keys = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'i18n') walk(path);
        continue;
      }
      if (!entry.isFile() || !/\.(ts|html)$/.test(entry.name) || entry.name.endsWith('.spec.ts')) continue;
      const content = readFileSync(path, 'utf8');
      // 前缀允许 i18n.t / this.t，排除 set( / split( 等子串误匹配。
      const re = /(?:^|[^A-Za-z0-9_])t\('((?:[^'\\]|\\.)*)'/g;
      for (const match of content.matchAll(re)) {
        const key = match[1];
        if (!key || key.length > 90 || /[\\\n\r]/.test(key)) continue;
        keys.add(key);
      }
      for (const match of content.matchAll(/(?:^|[^A-Za-z0-9_])resolve\('((?:[^'\\]|\\.)*)'/g)) {
        const key = match[1];
        if (!key || key.length > 90 || /[\\\n\r]/.test(key)) continue;
        keys.add(key);
      }
    }
  };
  walk(SRC_ROOT);
  return keys;
};

describe('desktop 目录覆盖门禁', () => {
  it('源码里 t() 用到的每个 key 都同时存在于中英目录', () => {
    const en = new Set(Object.keys(DESKTOP_MESSAGES_EN));
    const zh = new Set(Object.keys(DESKTOP_MESSAGES_ZH));
    const missing = [...usedKeys()].filter(key => !en.has(key) || !zh.has(key)).sort();
    expect(missing).toEqual([]);
  });

  it('应用清单的每个 nameKey 都同时存在于中英目录', () => {
    const en = new Set(Object.keys(DESKTOP_MESSAGES_EN));
    const zh = new Set(Object.keys(DESKTOP_MESSAGES_ZH));
    const missing = Object.values(DESKTOP_APP_MANIFESTS)
      .flatMap(manifest => (manifest.nameKey ? [manifest.nameKey] : []))
      .filter(key => !en.has(key) || !zh.has(key))
      .sort();
    expect(missing).toEqual([]);
  });
});
