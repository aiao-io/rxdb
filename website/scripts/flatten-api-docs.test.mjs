import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  plainTextMediaPackageLinks,
  rewriteMediaFileLinks,
  rewriteMediaPackageLinks,
  rewriteRelativeApiLinks
} from './flatten-api-docs.mjs';

test('importing the module does not run the flatten', () => {
  // 能执行到这一行本身就是断言：没有主入口守卫时，import 会同步跑完整个 flatten，
  // 把本机 docs/api 的真实结构搬动一遍。
  assert.equal(typeof rewriteMediaPackageLinks, 'function');
});

test('包目录被 typedoc 当作 media 复制的链接重写为兄弟包页', () => {
  // 源 README 里 `../rxdb-plugin-history` 指向兄弟包目录；typedoc 把它复制进
  // docs/api/_media/ 并把 href 改成 `../_media/rxdb-plugin-history`。扁平化后该 href
  // 从包 README 页解析会落到 /docs/_media/，Docusaurus 判为坏链。应重写为指向
  // docs/api/<pkg> 的兄弟页链接。目标必须保留 /README.md 后缀：包 README 页的
  // 路由是文件夹索引形态，无后缀链接会被按路由解析再丢一层。
  const content = '见 [`@aiao/rxdb-plugin-history`](../_media/rxdb-plugin-history) 文档。';

  assert.equal(
    rewriteMediaPackageLinks(content, ['rxdb-plugin-history']),
    '见 [`@aiao/rxdb-plugin-history`](../rxdb-plugin-history/README.md) 文档。'
  );
});

test('带 README.md 后缀的 media 链接同样重写', () => {
  const content = '见 [历史](../_media/rxdb-plugin-history/README.md)。';

  assert.equal(
    rewriteMediaPackageLinks(content, ['rxdb-plugin-history']),
    '见 [历史](../rxdb-plugin-history/README.md)。'
  );
});

test('非包 media（图片等）链接原样保留', () => {
  const content = '![结构图](../_media/working-tree-architecture.png)';

  assert.equal(rewriteMediaPackageLinks(content, ['rxdb-plugin-history']), content);
});

test('不在包名列表里的 media 链接原样保留', () => {
  const content = '见 [未知](../_media/not-a-package)。';

  assert.equal(rewriteMediaPackageLinks(content, ['rxdb-plugin-history']), content);
});

test('media 里有包 README 但站点没有对应文档页时降级为纯文本', () => {
  // typedoc 入口没有 rxdb-plugin-history，docs/api/ 下没有它的页面可指；media 副本
  // 在 docusaurus 里不可路由，保留链接就是坏链。参照 docker/sql 先例降级为纯文本。
  const content = '见 [`@aiao/rxdb-plugin-history`](../_media/rxdb-plugin-history) 文档。';

  assert.equal(plainTextMediaPackageLinks(content, ['rxdb-plugin-history']), '见 `@aiao/rxdb-plugin-history` 文档。');
});

test('带 README.md 后缀的无页面 media 链接同样降级', () => {
  const content = '见 [历史](../_media/rxdb-plugin-history/README.md)。';

  assert.equal(plainTextMediaPackageLinks(content, ['rxdb-plugin-history']), '见 历史。');
});

test('非包 media（图片等）不降级为纯文本', () => {
  const content = '![结构图](../_media/working-tree-architecture.png)';

  assert.equal(plainTextMediaPackageLinks(content, ['rxdb-plugin-history']), content);
});

test('有站点页的文件 media 链接重写为真实站点页', () => {
  // 源 README 链接 ../../website/docs/migration/history-sync-plugins.md，typedoc 把文件
  // 复制进 docs/api/_media/ 并把 href 改成 ../_media/history-sync-plugins.md。文件不是
  // 可路由的文档页，必须重写到 migration 页；用绝对路径，相对路径在 en 构建里只会
  // 在 en 树内解析（api 文档没有 en 版本，相对链接必断）。
  const content = '见 [历史与同步拆包](../_media/history-sync-plugins.md)。';

  assert.equal(rewriteMediaFileLinks(content), '见 [历史与同步拆包](/migration/history-sync-plugins.md)。');
});

test('没有站点页的文件 media 链接降级为纯文本', () => {
  // requirements 下的文档没有站点页可指，保留链接必成坏链，降级为纯文本。
  const content = '见 [miniprogram-platform-feasibility.md](../_media/miniprogram-platform-feasibility.md)。';

  assert.equal(rewriteMediaFileLinks(content), '见 miniprogram-platform-feasibility.md。');
});

test('非 .md 的 media 文件链接原样保留', () => {
  // .mjs / .ts 等文件不在 Docusaurus 的坏链检查范围内。
  const content = '见 [`build.mjs`](../_media/build.mjs)。';

  assert.equal(rewriteMediaFileLinks(content), content);
});

test('包内相对链接绝对化为 /api/<pkg>/…', () => {
  const content =
    '见 [CodeEditorSetup](type-aliases/CodeEditorSetup.md) 与 [CodeEditor](../code-editor/interfaces/CodeEditorLanguageDescription.md)。';

  assert.equal(
    rewriteRelativeApiLinks(content, 'code-editor-react/README.md'),
    '见 [CodeEditorSetup](/api/code-editor-react/type-aliases/CodeEditorSetup.md) 与 [CodeEditor](/api/code-editor/interfaces/CodeEditorLanguageDescription.md)。'
  );
});

test('跨包 ../../ 相对链接绝对化', () => {
  const content =
    '返回 [I18n](../../rxdb-i18n/classes/I18n.md) 与 [EntityType](../../rxdb/type-aliases/EntityType.md)。';

  assert.equal(
    rewriteRelativeApiLinks(content, 'rxdb-plugin-board/functions/createBoardI18n.md'),
    '返回 [I18n](/api/rxdb-i18n/classes/I18n.md) 与 [EntityType](/api/rxdb/type-aliases/EntityType.md)。'
  );
});

test('深层页面同包 ../ 相对链接绝对化', () => {
  const content = '见 [CodeEditorLanguageDescription](../interfaces/CodeEditorLanguageDescription.md)。';

  assert.equal(
    rewriteRelativeApiLinks(content, 'code-editor/functions/resolveCodeEditorLanguage.md'),
    '见 [CodeEditorLanguageDescription](/api/code-editor/interfaces/CodeEditorLanguageDescription.md)。'
  );
});

test('绝对化包内和跨包链接并保留标题锚点', () => {
  const content = '见 [构造函数](RxDBError.md#constructor) 与 [合并变更](../../rxdb-plugin-sync/functions/push.md#returns)。';

  assert.equal(
    rewriteRelativeApiLinks(content, 'rxdb/classes/RxDBIdentityMismatchError.md'),
    '见 [构造函数](/api/rxdb/classes/RxDBError.md#constructor) 与 [合并变更](/api/rxdb-plugin-sync/functions/push.md#returns)。'
  );
});

test('已是绝对路径或外链的链接原样保留', () => {
  const content = '见 [绝对链接](/api/rxdb/classes/RxDB.md)、[外部链接](https://example.com/a.md) 与 [锚点](#x.md)。';

  assert.equal(rewriteRelativeApiLinks(content, 'rxdb/functions/foo.md'), content);
});
