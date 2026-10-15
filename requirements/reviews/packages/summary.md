---
title: packages 全量代码评审汇总
status: StaticReview
baseline: main@94df0a04
reviewed: 2026-10-16
---

# packages 全量代码评审汇总

## 结果

本轮覆盖 `packages/` 下 51 个包，每包一份报告。静态源码、配置、公开入口、测试目录和 README 已按分组完成检查；没有修改生产代码、测试代码或依赖。

已确认 6 条问题：2 条 P1、4 条 P2；没有 P0 或 P3。

| 等级 | 包 | 问题 |
| --- | --- | --- |
| P1 | `rxdb-adapter-pglite` | 关系 JOIN SQL 在一对一、一对多、多对多路径硬编码关联主键物理列 `id`，自定义 `columnName` 时关系查询失败或条件错误。 |
| P1 | `rxdb-adapter-supabase` | CRUD、分页、树查询和行转换硬编码物理列 `id`，没有遵循 metadata 的主键列映射。 |
| P2 | `rxdb-adapter-supabase` | `collectParents()` 只接受字符串 `parentId`，数值/BigInt 父节点的 `hasChildren` 会被误判为 false。 |
| P2 | `rxdb-model` | `URLValue` 等连续大写缩写被默认标题生成器拆成 `U R L Value`，与自身文档示例不一致。 |
| P2 | `rxdb-plugin-querycache` | README 要求 history/sync 为硬依赖，但 `package.json` 未声明对应 peerDependencies，安装阶段无法表达缺失依赖。 |
| P2 | `rxdb-plugin-replay-vue` | README 承诺挂载前 `seek()` 会记忆目标时刻，但 Vue 适配层没有保存 pending seek；目标被静默丢失，和 Angular/React 不一致。 |

## 验证结论

- `pnpm audit:docs-plugins`：通过，扫描 169 个文档入口。
- `pnpm audit:conditions`：通过，运行时条件元数据一致。
- `pnpm audit:build-entries`：未通过/未执行到包检查；新评审 worktree 没有构建产物，脚本返回「一个包都没扫到」。
- Nx 的全量项目图和包级动态门禁未完成：当前主机 Node `v22.14.0`，仓库要求 `>=26`；即使复用依赖目录，Nx 插件加载仍因缺少可解析的可选构建插件和受限环境报错。逐包报告均将动态结论标为待验证，没有把静态检查写成测试通过。

## 修复顺序建议

1. 先修 P1：抽取统一的 metadata 主键物理列解析，并覆盖 PGlite/Supabase 的关系、分页、CRUD、树查询和行转换。
2. 修 P2：统一实体 ID canonical 化；修正 `rxdb-model` 缩写分词并补回归；把 QueryCache 的 history/sync 加入 peer 元数据并做独立打包消费验证。
3. 在 Node 26+ 环境串行执行 51 个包的 lint/typecheck/test/build，补跑浏览器、真实 Supabase/PostgREST、PGlite JOIN、桌面/Tauri/小程序宿主测试。
4. 修复完成后删除或归档对应报告中的问题条目，保留验证证据和回归测试链接。

## 文档导航

- `plan.md`：总计划、分组、分级和执行步骤。
- `core-plan.md`、`adapter-plan.md`、`plugin-plan.md`：三组评审方法和验证限制。
- `cross-framework.md`：Angular/React/Vue 交叉 API 对照。
- 51 个 `<package>.md`：逐包检查范围、发现、风险和验证建议。
