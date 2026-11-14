import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { patchPreviewServiceWorker } from './vivari-service-worker.js';

const RULE = '  if (url.pathname.startsWith("/@fs/") && !referrerIsPreview(event.request.referrer)) return;\n';

const worker = (rules: string): string =>
  `self.addEventListener("fetch", event => {\n  const url = new URL(event.request.url);\n${rules}  event.respondWith(routeByClient(event, url));\n});\n`;

/** 当前安装的 @vivari/core 随包的预览 Service Worker。 */
function installedWorker(): string {
  const root = dirname(createRequire(import.meta.url).resolve('@vivari/core/package.json'));
  return readFileSync(join(root, 'dist/assets/sw.js'), 'utf8');
}

describe('vivari 预览 Service Worker 补丁', () => {
  it('只去掉 /@fs/ 的放行规则，其余原样保留', () => {
    expect(patchPreviewServiceWorker(worker(RULE))).toBe(worker(''));
  });

  it.each([
    ['规则不在了', worker(''), '出现了 0 处'],
    ['规则出现多处', worker(RULE + RULE), '出现了 2 处']
  ])('%s：报错，要求核对新版后再更新补丁', (_name, source, found) => {
    expect(() => patchPreviewServiceWorker(source)).toThrow(found);
  });

  it('当前安装的 @vivari/core 恰好含这一条规则（升级后写法变了，这里先红）', () => {
    const source = installedWorker();
    const patched = patchPreviewServiceWorker(source);
    expect(patched).toHaveLength(source.length - RULE.length);
    expect(patched).not.toContain('startsWith("/@fs/") && !referrerIsPreview');
  });
});
