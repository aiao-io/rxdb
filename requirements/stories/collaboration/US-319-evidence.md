# US-319 / US-320 验收运行记录

> 本文件是 [US-319](./US-319-remote-commit-import.md) 与 [US-320](./US-320-discard-restore-projection.md) frontmatter `evidence` 指向的运行记录。
> 两条故事的正文只写复验入口；带日期的运行结果记在这里，重跑后整表覆盖。

## 运行环境

| 项   | 值                                                                     |
| ---- | ---------------------------------------------------------------------- |
| 日期 | 2026-11-19                                                             |
| 提交 | `3855b58e7`（`admin-template` 分支）                                   |
| Node | 26.12.0                                                                |
| 平台 | darwin arm64（macOS 27.2.1）                                           |
| 缓存 | 全程 `--skip-nx-cache`，构建与测试都重新执行、不回放缓存               |
| 顺序 | 串行：构建完成后一次只跑一个项目，测试带 `--exclude-task-dependencies` |

## 命令与结果

| 步骤       | 命令                                                                                                                                             | 结果                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 构建       | `pnpm nx run-many -t build --projects=<六个适配器与三端绑定> --skip-nx-cache`                                                                    | 9 个项目与它们依赖的 16 个任务构建成功                                                |
| 插件单测   | `pnpm nx test rxdb-plugin-working-tree --skip-nx-cache --exclude-task-dependencies`                                                              | 89 个测试文件、1513 条用例通过，覆盖率阈值通过                                        |
| 一致性套件 | `pnpm nx test <适配器> --skip-nx-cache --exclude-task-dependencies -- --run --coverage.enabled=false src/__tests__/worktree-conformance.spec.ts` | electron、pglite、sqlite-wasm、sqlite、sqliteai、wa-sqlite 各 62 条用例通过，没有跳过 |
| 三端绑定   | `pnpm nx test rxdb-plugin-working-tree-angular`、`-react`、`-vue`（同样带 `--skip-nx-cache --exclude-task-dependencies`）                        | Angular 95 条、React 89 条、Vue 86 条用例通过                                         |
| 调用点漂移 | `pnpm audit:callsite-drift`                                                                                                                      | 15 个登记调用点全部一致                                                               |
| 子路径入口 | `pnpm audit:build-entries`                                                                                                                       | 通过                                                                                  |

一致性套件共 62 条用例，「导入远端提交（US-319）」与「放弃与恢复回写业务表（US-320）」两节都在其中，六个适配器跑的是同一份。

## 本次没有重跑

下面三项沿用实现时的结论，不在这次复跑范围内：

- `pnpm nx run website:check-doc-code`（文档代码块）。
- React working-tree e2e。
- `./exchange` 的 dist 在 Deno 下复算示例哈希（手工核对，没有自动化入口）。
