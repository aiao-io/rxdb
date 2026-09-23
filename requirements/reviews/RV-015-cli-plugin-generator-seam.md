---
id: RV-015
title: CLI 没有加载插件生成器的缝，插件自带的 RepositoryGenerator 在生产链路上零接线
status: Open # Open / Resolved
created: 2026-09-22
updated: 2026-09-22
pr: # 修复 PR 链接，Resolved 时填
---

# Review：CLI 缺「生成器插件加载」缝

## 问题

`RxDBClientGenerator` 有公开的注册 API
[`registerRepositoryGenerator`](../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts)，
TSDoc 里也写着 `generator.registerRepositoryGenerator(new GeoRepositoryGenerator())` 的示例，
但**命令行链路上没有任何调用方**：
[`build-client-lib.ts`](../../packages/rxdb-client-generator/src/cli/build-client-lib.ts) 的
`buildOnce()` 只 `new RxDBClientGenerator(generatorOptions)`，
`RxDBClientCLIentGeneratorOptions` 里没有任何「装哪些生成器」的字段。
内置生成器则在构造函数里硬编码注册（`RepositoryMethodsGenerator` 与 `TreeRepositoryGenerator`）。

后果已经发生在 `@aiao/rxdb-plugin-graph` 上：它带了
[`GraphRepositoryGenerator`](../../packages/rxdb-plugin-graph/src/generator/GraphRepositoryGenerator.ts)
并从 `/generator` 子路径导出，全仓唯一的 `registerRepositoryGenerator(new GraphRepositoryGenerator())`
调用在它**自己的 spec 里**。也就是说：用 CLI 生成客户端的项目，`@GraphEntity` 实体拿不到
图查询方法——生成器存在、导出正常、却永远不被装上。

这条缝的缺席直接改变了 US-025 阶段 E 的做法：树插件**刻意没有**把
`TreeRepositoryGenerator` 搬进 `@aiao/rxdb-plugin-tree/generator`，
它仍留在 `@aiao/rxdb-client-generator` 里硬编码注册——照搬 graph 的形状会让
`@TreeEntity` 的 CLI 代码生成直接失效。代价是 `rxdb-client-generator`
反向依赖了 `@aiao/rxdb-plugin-tree`（取 `TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS`
与 `entityBaseModuleSpecifier` 用的包名）。

## 根因

`registerRepositoryGenerator` 是按「库使用者手写脚本」设计的 API——在自己的 Node 脚本里
`new RxDBClientGenerator(...)` 然后逐个注册。而实际生产链路是 CLI 读配置文件，
两者之间没有桥：配置文件描述不出「再装一个生成器」。

图插件外移时没有人验证生成器这一侧的接线（它的 spec 自己调用了注册 API，
覆盖率与测试都是绿的，正好掩盖了零接线）。

## 修复方案

给 CLI 配置加一个生成器加载项，形状与 `entities` 的 glob 对齐——值是模块规格 + 导出名，
由 CLI 动态 import 后 `registerRepositoryGenerator`：

```jsonc
{
  "entities": ["src/**/*.entity.ts"],
  "repositoryGenerators": ["@aiao/rxdb-plugin-graph/generator#GraphRepositoryGenerator"]
}
```

两个病灶共用这一个抽象（graph 已发生、tree 被它挡住），满足 CONVENTIONS 的
「病灶数 ≥ 抽象数」。缝落地后再单独决定 `TreeRepositoryGenerator` 要不要迁进树插件，
并解开 `rxdb-client-generator → @aiao/rxdb-plugin-tree` 这条反向依赖。

判据：

1. 新增用例——配置里声明图生成器，跑 CLI，产物含 `findNeighbors` 等图方法；不声明则不含。
2. `pnpm nx graph` 里 `rxdb-client-generator` 不再指向任何 `rxdb-plugin-*`。

## 解决记录

- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
