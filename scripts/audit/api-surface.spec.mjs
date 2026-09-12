import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { extractExports } from './api-surface.mjs';

const fixtureSrc = fileURLToPath(new URL('./__fixtures__/api-surface/type-only-reexport/src/', import.meta.url));
const kindOf = (exports, name) => exports.find(e => e.name === name)?.kind;

test('`export type { Klass }` 记为 type —— 运行时没有这个值', () => {
  // 门禁存在的意义是拦「破坏性 API 变化」。把 `export { X }` 改成 `export type { X }`
  // 会抽掉运行时的值，所有 `new X()` / `extends X` 的使用者当场炸；若两种形式都记成
  // `both`，这次改动在基线 diff 里完全看不见。
  const exports = extractExports(`${fixtureSrc}index.ts`, fixtureSrc);

  assert.equal(kindOf(exports, 'Widget'), 'type');
});

test('逐 specifier 的 `export { type Klass }` 同样记为 type', () => {
  // 与语句级 type-only 是不同的 AST 形状（ExportSpecifier.isTypeOnly 而非
  // ExportDeclaration.isTypeOnly），只认一种就会漏掉另一种。
  const exports = extractExports(`${fixtureSrc}index.ts`, fixtureSrc);

  assert.equal(kindOf(exports, 'Gadget'), 'type');
});

test('值形式转出的类仍是 both —— 不能把所有类一律降级', () => {
  const exports = extractExports(`${fixtureSrc}index.ts`, fixtureSrc);

  assert.equal(kindOf(exports, 'Sprocket'), 'both');
});

test('纯类型与纯值不受影响', () => {
  const exports = extractExports(`${fixtureSrc}index.ts`, fixtureSrc);

  assert.equal(kindOf(exports, 'WidgetOptions'), 'type');
  assert.equal(kindOf(exports, 'VERSION'), 'value');
});
