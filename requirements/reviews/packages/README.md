# packages 评审文档

本目录包含 51 份逐包报告及分组计划。当前评审到 `ffed57da`（2026-10-26），在上轮报告提交 `18ea576f` 基础上按提交记录增量检查；首轮起点 `94df0a04` 仅作为历史来源，不再代表当前代码。

**当前去重待处理 45 条（4 P1 + 26 P2 + 15 P3）**：上轮 43 条继续保留，本轮新增 2 条 P2。已修复的首批 6 条不再重复列入报告，历史可从 Git 取回。

先看 [本轮提交与验证记录](./incremental-2026-10-26.md)、[问题汇总](./summary.md)、[跨框架复核](./cross-framework.md)；[总计划](./plan.md)说明评审方法和边界。本轮仅更新评审文档。

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
