# packages 评审文档

本目录记录从 `main@94df0a04` 开始的 `packages/` 全量代码评审。总计划见 [plan.md](./plan.md)，结果汇总见 [summary.md](./summary.md)，跨框架复核见 [cross-framework.md](./cross-framework.md)。

本轮共覆盖 51 个包、产出 51 份逐包报告；报告只记录评审结论，不修改生产代码。问题总览、验证限制和修复顺序以汇总文档为准。首轮 6 条问题已在 `codex/packages-review` 分支修复；二次评审（`claude/packages-review-second-pass-b6d52b`）复核全部修复并新确认 24 条未处理问题，报告中的「已修复（二次评审复核）」条目为审计记录，尚未处理的条目见各报告「发现」节。

## 核心与框架

- [code-editor](./code-editor.md) · [code-editor-angular](./code-editor-angular.md) · [code-editor-react](./code-editor-react.md) · [code-editor-vue](./code-editor-vue.md)
- [rxdb](./rxdb.md) · [rxdb-angular](./rxdb-angular.md) · [rxdb-react](./rxdb-react.md) · [rxdb-vue](./rxdb-vue.md)
- [rxdb-model](./rxdb-model.md) · [rxdb-model-angular](./rxdb-model-angular.md) · [rxdb-model-react](./rxdb-model-react.md) · [rxdb-model-vue](./rxdb-model-vue.md)
- [rxdb-client-generator](./rxdb-client-generator.md) · [rxdb-devtools](./rxdb-devtools.md) · [rxdb-test](./rxdb-test.md) · [utils](./utils.md)

## 存储与宿主适配器

- [rxdb-adapter-electron](./rxdb-adapter-electron.md) · [rxdb-adapter-encrypted](./rxdb-adapter-encrypted.md) · [rxdb-adapter-http](./rxdb-adapter-http.md)
- [rxdb-adapter-miniprogram](./rxdb-adapter-miniprogram.md) · [rxdb-adapter-pglite](./rxdb-adapter-pglite.md) · [rxdb-adapter-sqlite](./rxdb-adapter-sqlite.md)
- [rxdb-adapter-sqlite-core](./rxdb-adapter-sqlite-core.md) · [rxdb-adapter-sqlite-wasm](./rxdb-adapter-sqlite-wasm.md) · [rxdb-adapter-sqliteai](./rxdb-adapter-sqliteai.md)
- [rxdb-adapter-supabase](./rxdb-adapter-supabase.md) · [rxdb-adapter-tauri](./rxdb-adapter-tauri.md) · [rxdb-adapter-wa-sqlite](./rxdb-adapter-wa-sqlite.md) · [rxdb-taro](./rxdb-taro.md)

## 插件

- [rxdb-plugin-graph](./rxdb-plugin-graph.md) · [rxdb-plugin-history](./rxdb-plugin-history.md) · [rxdb-plugin-querycache](./rxdb-plugin-querycache.md) · [rxdb-plugin-storage](./rxdb-plugin-storage.md) · [rxdb-plugin-sync](./rxdb-plugin-sync.md) · [rxdb-plugin-workspace](./rxdb-plugin-workspace.md)
- [rxdb-plugin-replay](./rxdb-plugin-replay.md) · [rxdb-plugin-replay-angular](./rxdb-plugin-replay-angular.md) · [rxdb-plugin-replay-react](./rxdb-plugin-replay-react.md) · [rxdb-plugin-replay-vue](./rxdb-plugin-replay-vue.md)
- [rxdb-plugin-search](./rxdb-plugin-search.md) · [rxdb-plugin-search-angular](./rxdb-plugin-search-angular.md) · [rxdb-plugin-search-react](./rxdb-plugin-search-react.md) · [rxdb-plugin-search-vue](./rxdb-plugin-search-vue.md)
- [rxdb-plugin-tree](./rxdb-plugin-tree.md) · [rxdb-plugin-tree-angular](./rxdb-plugin-tree-angular.md) · [rxdb-plugin-tree-react](./rxdb-plugin-tree-react.md) · [rxdb-plugin-tree-vue](./rxdb-plugin-tree-vue.md)
- [rxdb-plugin-working-tree](./rxdb-plugin-working-tree.md) · [rxdb-plugin-working-tree-angular](./rxdb-plugin-working-tree-angular.md) · [rxdb-plugin-working-tree-react](./rxdb-plugin-working-tree-react.md) · [rxdb-plugin-working-tree-vue](./rxdb-plugin-working-tree-vue.md)
