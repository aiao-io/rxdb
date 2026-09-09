# next-0831 分支评审 · 剩余项

- **原评审**：`next-0831` 相对 `main`，432 文件 / 约 29,531 行新增，24 条确认为真（1 critical / 4 high / 9 medium / 10 low）+ 3 条推翻
- **本次复核**：2026-09-09，逐条对照 HEAD 源码
- **结论**：critical / high / medium 十四条全部已修（判据是缺陷不再可复现）；低危十条里 7 条已修或已按「记录在案的取舍」收口，2 条判为不值得做，**剩 3 条仍值得做**

已删除的内容是「复核后确认不再可复现」或「明确不做」的条目，不再逐条留档 —— 修法都已落在代码与注释里，报告再留一份只会与代码漂移。两条判为不值得做的：

- `tools/pglite-tx-experiment/variant-a-host.mjs:114` 的超时不 settle —— 一次性原型量具，生产版 `electron-pglite-host.ts` 已修，量具本身不进产物也不再跑。
- 四个 adapter 的 `files` 排除 `__tests__` 与 `src/testing.ts` 的 `import.meta.glob` 冲突 —— 只影响 monorepo 内部的 `@aiao/source` 条件，发布消费者拿到的是打好的 `dist/testing.js`，路径可达。

---

## 1. `mapEngineError` 把内部错误伪装成客户端错误

- **文件**：`apps/dev-rxdb-http-server/src/recipes-repository.ts:82-89`
- **现象**：`error instanceof RxdbAdapterPGliteError` 一律映射为 400。但这个类同时用于内部失败——`Unsupported repository type`、`DURABILITY_LOST`、`transformValueJsToPGlite` 的转换失败——服务端 bug 于是以 400 回给客户端。
- **后果**：客户端按「我发的请求不对」重试或改参，实际怎么改都不会变；监控上服务端错误率恒为 0。
- **修法**：按 PGlite 错误的具体成因分流，只有「输入不合法」那一类回 400，其余回 500。至少把 `DURABILITY_LOST` / `Unsupported repository type` 显式拎出来。

## 2. `modules/recipes-domain/src/recipe-query.ts` 无单测

- **文件**：`modules/recipes-domain/src/recipe-query.ts`（81 行，`__tests__/` 下只有 `recipe-schema.spec.ts`）
- **现象**：前后端共用的「单一来源」wire 序列化与分页查询构造器——`toRecipeWireRow` / `toRecipeMetadataRow` / `buildRecipePageQuery` / `RECIPE_ORDER_BY`，含 `toIso` 的分支——一条断言都没有；被覆盖的只有 schema metadata。
- **后果**：违反 TDD 铁律；它是前后端约定的形状定义，改错了两端一起错，而且要到跑起来才发现。
- **修法**：补 spec，至少钉住 `toIso` 的各分支、`buildRecipePageQuery` 的排序与游标边界、两个 `toRecipeWireRow` 的字段集。

## 3. 旁支：`tauri dev` 下 devtools 窗口是坏的

- **文件**：`apps/dev-rxdb-tauri/src-tauri/tauri.conf.json:16-19`
- **现象**：`beforeDevCommand` 是 `nx serve dev-rxdb-tauri`（`@angular/build:dev-server`，端口 1420），它不依赖 `build-devtools`；而 `beforeBuildCommand` 才跑 `nx run dev-rxdb-tauri:build-devtools`。于是 dev 模式下 dev server 根本不提供 `devtools/devtools.html`，`#[cfg(dev)]` 编出来的 devtools 窗口打开即 404。
- **来源**：原评审第 3 条「构建顺序删除 devtools 产物」经复核推翻（两个前置条件互斥），但复核过程中撞见这个成因不同的相邻 bug，当时未二次验证；本次复核确认配置仍是原样。
- **修法**：给 `serve` 目标加 `build-devtools` 依赖，或让 dev server 把 devtools 产物一起提供出去（`assets` 指向 devtools 的输出目录）。
