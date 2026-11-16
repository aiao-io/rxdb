---
id: ADMIN-US-004
title: 三端共用产品根需求与统一门禁
status: In Review
priority: High
epic: ADMIN-EPIC-001
created: 2026-11-16
updated: 2026-11-16
tags: [admin, product, requirements, nx, angular, react, vue]
dependsOn: [ADMIN-US-001]
capabilities: []
---

# 用户故事：三端共用产品根需求与统一门禁

## 作为/我想要/以便

**作为** RxDB Admin Template 产品维护者
**我想要** 在产品根目录统一管理三端需求和校验入口
**以便** 多个 Nx 应用共用一套故事、状态和验收，跨端工作不再归入某一个框架应用。

## 范围边界

### In Scope

- 将三端应用和对应 E2E 一起归入产品 `apps/`，保留原 Nx 项目名；将完整需求树和需求门禁脚本迁至 `rxdb-admin-template/`，保留已有 `ADMIN-*` 编号、状态和历史证据。
- 产品根 README 和约定明确三个应用、对应 E2E、公共平台能力与产品故事的边界。
- 提供产品级 Nx 门禁，三端同名入口和 `test` 共用产品任务。
- 声明三端对产品治理项目的依赖，使产品需求变更进入三端和 E2E 的 affected 范围。
- 更新有效文档、故事实现入口和本地链接，并拒绝子应用重新建立需求副本。

### Out of Scope

- 修改运行时数据标识、端口、业务行为或对外平台公共 API。
- 将需求迁移等同于认证、团队协作、服务端合并或独立模板发行完成。

## 验收标准

| #   | 前置条件                         | 操作                                                        | 预期结果                                                                                                                | 状态 |
| --- | -------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 三端原来以 React 为需求入口      | 查看产品目录和原故事                                        | 仓库根 `rxdb-admin-template/` 同时包含六个成员的 `apps/` 与唯一 `requirements/`；原 21 条故事编号、状态及历史证据不丢失 | ✅   |
| 2   | 从产品、三端和根平台文档进入需求 | 打开故事、计划、源码与验收链接                              | 当前入口指向产品需求；各应用源码证据指向迁移后的实际文件，无失效本地链接和标题锚点                                      | ✅   |
| 3   | 产品门禁和三端兼容目标可用       | 运行产品及三端需求门禁                                      | 同一任务图只执行一份产品文档检查和一份回归测试；错误文档被共享门禁拒绝                                                  | ✅   |
| 4   | 产品需求目录中的一个文件发生变化 | 运行 Nx affected 查询并查看测试任务图                       | 三个应用和对应 E2E 全部在影响范围；三端 `test` 均依赖产品门禁                                                           | ✅   |
| 5   | 某个成员应用试图恢复独立需求目录 | 执行需求校验负例                                            | 产品门禁拒绝需求副本、缺少的产品内成员和被改名的 Nx 项目；正常跨应用源码链接仍通过                                      | ✅   |
| 6   | 六个成员已迁入产品 `apps/`       | 执行三端及 E2E 的 lint、typecheck、test、build 和浏览器回归 | 新位置的配置与共享场景可运行，三端功能和持久化边界保持原行为                                                            | ✅   |

六项 AC 已在仓库根产品目录完成本地复验，状态保持 In Review，待统一评审与合并。验收证据： [产品需求迁移验收](../../plans/product-requirements-verification.md)。结构门禁只证明需求与任务接线，不代替业务能力验收。

## 技术笔记

产品治理项目保留在当前唯一 Nx workspace。子应用通过显式依赖关联产品项目，同名兼容目标依赖产品任务；应用源码和共享 E2E 场景统一位于产品 `apps/`，保留现有项目名。配置、pnpm workspace、TypeScript 引用、WASM 和共享场景路径按新目录接线。带日期的历史执行命令保留原事实，当前入口和验收台账使用产品命令。

## 实现文件

- `rxdb-admin-template/requirements/` — 产品需求唯一真相源。
- `rxdb-admin-template/project.json` — 产品门禁、回归和 lint 目标。
- `rxdb-admin-template/scripts/check-requirements.mjs` — 产品边界与需求一致性检查。
- `rxdb-admin-template/scripts/check-requirements.spec.mjs` — 正负夹具及跨应用链接回归。
- `rxdb-admin-template/apps/{angular,react,vue}/project.json` — 产品依赖、兼容目标和测试前置。

## References

- [ADMIN-US-001](ADMIN-US-001-application-requirements.md)
- [产品 README](../../../README.md)
- [D-07](../../decisions.md#d-07三端共用产品根需求)
- [应用级需求与项目治理办法](../../../../requirements/application-governance.md)
