---
id: US-031
title: 树形实体迁移到排序模块
status: Backlog
priority: Low
epic: epic-004-future-features
created: 2026-10-03
updated: 2026-10-06
tags: [core, sortable, tree, rxdb-test, demo]
---

# 用户故事：树形实体迁移到排序模块

## 作为/我想要/以便

**作为** 模型开发者
**我想要** 树形实体的兄弟排序改走 [US-028](US-028-sortable-entity.md) 的排序模块（以 `parentId` 为分组字段），三个 demo 的树拖放改用排序模块的创建追加与重排 API
**以便** 树与扁平实体共用一套键不变量、事务写边界与比较规则，demo 不再各算一遍排序键

## 背景与动机

- **排序键在 demo 里算了三遍。** 三个 demo 应用的树菜单与文件管理直接调 `@aiao/utils` 的 `generateKeyBetween`
  算键，共 22 个文件（Angular 6、React 8、Vue 8）：`MenuDragDropService` / `FileDragDropService`、React / Vue 的
  `useDragDropService`、各页 store 与 `menu-utils` / `file-utils` 批量造数。「新建追加到同父末尾」「拖放插到两邻之间」
  「跨父拖放」三端各写一遍。
- **demo 的写入没有事务边界与锚点校验。** 拖放服务在内存兄弟列表上取相邻键（`prevItem?.sortOrder || null`）再
  `save()`，读与写不在同一事务，也不复核邻居是否仍相邻；NULL 键按 `|| null` 当作序列端点参与算键。
- **比较器也各写一份。** Angular `tree-menu-lazy.store.ts` 内联码点比较，React / Vue 各一份 `utils/sort-order.ts`
  的 `compareSortOrder`，三端 `file-sorters.ts` 的 Manual 模式又各一份；三份结果一致，但没有共同来源。
- **树实体的 `sortOrder` 可空。** `rxdb-test` 的 `MenuSimple` / `MenuLarge` / `FileNode` / `FileLarge` 声明
  `sortOrder` 为 `nullable: true`，不满足 US-028 的非空校验，不迁移就不能声明可排序。
- **树兄弟域就是分组排序域。** 同父兄弟构成一条序列、根节点为 NULL 组，与 US-028 阶段 D 的分组语义一致；
  跨父拖放就是跨组移动，外加防止拖进自己后代的环检测。环检测今天只在三端 demo 的 `isDescendantOf` 里（内存版），
  `@aiao/rxdb-plugin-tree` 只有查询期的防环（`tree-helper.ts` 的 `visited`、适配器递归深度保护）。

## 范围边界

### In Scope

- `rxdb-test` 的四个树实体声明可排序（分组字段 `parentId`），`sortOrder` 改非空，存量数据按 `parentId` 分组回填
- 三个 demo 树菜单与文件管理的新建追加改用 core 创建追加（不再自己算键），同父拖放与跨父拖放改用 core 重排 API
- 删除 demo 内算树排序键的代码与 `sortOrder` 比较器副本，顺序由查询默认排序给出
- 跨父拖放的环检测与跨组移动的先后关系由 plan 写实

### Out of Scope

- US-028 本身的排序语义（本故事只消费 A + D）
- `@aiao/rxdb-plugin-tree` 写入期环检测、深度限制、懒加载语义；demo 的环检测可以继续用 `isDescendantOf`
- 树查询（`findDescendants` 等适配器递归 CTE）的排序
- `ISortableTreeEntity` 的 `sortOrder` 是否收窄为非空（收窄即破坏性变更，须走 api-baseline；plan 定）
- `file-sorters.ts` 的名称 / 类型 / 大小等非手动排序模式
- 树以外的 demo 页面

## 验收标准

| #   | 前置条件                                                                   | 操作                                                                                     | 预期结果                                                                                                                                                     | 状态 |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 四个树实体存量数据含 NULL 键、重复键、`localeCompare` 序与码点序不一致的键 | 执行迁移                                                                                 | 列改 `NOT NULL`；每个父节点（含根的 NULL 组）的兄弟键严格递增，不同父节点可以重复；迁移后的显示顺序与迁移前一致（码点序、NULL 视为最小、同键按 `id`）        | ⬜   |
| 2   | 三端 demo 树菜单与文件管理                                                 | 新建根节点与子节点；批量造数；同父拖放；跨父拖放到两邻之间与拖进某节点内部；拖到自己后代 | 新建追加到同父末尾，键由 core 补；同父拖放只写 `sortOrder`；跨父拖放在一个事务内只写 `parentId` 与 `sortOrder`；拖到后代被拒绝、零写；三端顺序与 DB 重查一致 | ⬜   |
| 3   | 三端 demo 源码                                                             | 检索 `generateKeyBetween` / `generateKeysBetween` 与 `sortOrder` 比较器                  | 树页面、store 与拖放服务不再直接算树排序键，也不再自带 `sortOrder` 比较器                                                                                    | ⬜   |
| 4   | 现有树测试与三端 demo e2e                                                  | 运行                                                                                     | 全部通过；树查询结果与迁移前一致                                                                                                                             | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **前置**（均已交付）：US-028 阶段 A（排序模块、创建追加、重排 API）与阶段 D（分组字段、NULL 组、跨组移动）。阶段 C 只迁移类型来源，
  不是本故事的前置。
- **回填顺序**：保持迁移前三端 demo 的显示顺序——每个 `parentId` 组内按码点序、NULL 视为最小、同键按 `id`，
  再 `generateKeysBetween(null, null, n)` 重新生成。迁移机制沿用 US-028「历史数据」一节。
- **拖进节点内部**：用重排 API 的「追加到某组末尾」形式，目标组就是被拖入节点的 `id`；不需要读目标节点的子节点。
- **环检测**：跨组移动本身不知道树结构，「拖到自己后代」必须在调用重排 API 之前拦住。demo 现有的 `isDescendantOf`
  基于内存列表，与重排事务之间有窗口（推断：并发移动下可能放过环，未复现）；是否把环检测挪进同一事务由 plan 定，
  挪进事务需要树插件提供写入期检测，那属于树插件能力，不在本故事。

## 价值待证

本故事**价值待证**。今天没有用户踩得到的症状：三端 demo 树排序的比较规则已经一致，键重复或邻居失效导致的错位没有复现。
本故事不新增抽象，收益是删掉 22 个文件里的重复算键与三份比较器；前置的 US-028 阶段 A + D 已交付。

**解锁条件**：demo 树拖放出现可复现的错序 / 键碰撞缺陷，或有外部调用方需要树实体经排序模块写入
（US-028 阶段 A 与 D 的前置已满足）。

## 实现文件

- `packages/rxdb-test/entities/MenuSimple.ts`、`MenuLarge.ts`、`FileNode.ts`、`FileLarge.ts` — 可排序声明、`sortOrder` 非空
- `apps/dev-rxdb-angular/src/app/pages/menu/`、`apps/dev-rxdb-angular/src/app/pages/file-manager/` — 拖放服务与 store 改用排序模块
- `apps/dev-rxdb-react/src/app/hooks/`、`apps/dev-rxdb-react/src/app/utils/` — 同上，删除 `sort-order.ts`
- `apps/dev-rxdb-vue/src/app/composables/`、`apps/dev-rxdb-vue/src/app/utils/` — 同上，删除 `sort-order.ts`

## References

- [US-028 可排序实体](US-028-sortable-entity.md) — 排序模块、分组排序域与跨组移动（阶段 A / D）
- [US-010 树形实体](US-010-tree-entity.md) — 树节点排序的原始验收（AC#2/#3）
- [tree-entity.interface.ts](../../../packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts) — `ISortableTreeEntity`
- [menu-drag-drop.service.ts](../../../apps/dev-rxdb-angular/src/app/pages/menu/services/menu-drag-drop.service.ts) — demo 算键与 `isDescendantOf` 现状
