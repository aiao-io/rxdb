---
id: ADESK-US-006
title: web 单测覆盖率门槛
status: Backlog
priority: Medium
epic: ADESK-EPIC-001
created: 2026-11-13
updated: 2026-11-13
tags: [platform, test, coverage]
dependsOn: [ADESK-US-102]
capabilities: []
---

# 用户故事：web 单测覆盖率门槛

## 作为/我想要/以便

**作为** 维护 Aiao Desktop 的开发者
**我想要** web 的单测接入仓库的覆盖率门槛并挡住回退
**以便** 磁盘、终端同步、窗口管理等核心逻辑改坏时在合并前被发现，而不是靠浏览器冒烟兜底。

## 范围边界

### In Scope

- `aiao-desktop-web:test` 输出 vitest 覆盖率报告，初始门槛为行与语句 ≥ 80%（应用不在 `packages/` 下，参考仓库非核心包的门槛；门槛写入本故事与门禁脚本）。统计范围（`include`）限定为非界面代码 `src/app/{services,disk,vm,data}/**`，排除 `*.spec.ts`、Angular 组件与模板（界面由冒烟覆盖），写进 `vitest.config.mts`；门槛按文件计算（vitest 的 `perFile`），失败信息直接指向低于门槛的文件与差值。范围内放不进 80% 的胶水文件（纯 Angular 注入、浏览器专有路径）逐个登记排除理由，不能整目录排除。
- 门槛接入 CI 的测试 lane 与 `aiao-desktop:verify`，低于门槛即失败，报出具体文件与差值。
- 补齐高风险服务的单测到门槛以上：窗口管理、FileSystem 与磁盘层、终端同步、会话状态。

### Out of Scope

- 界面组件与交互的逐组件单测（仍由冒烟覆盖）。
- 平台包（`packages/`）的覆盖率（各自已有门槛）。
- 把覆盖率数字当作跨浏览器行为证据。

## 验收标准

| #   | 前置条件                 | 操作                                                 | 预期结果                                           | 状态 |
| --- | ------------------------ | ---------------------------------------------------- | -------------------------------------------------- | ---- |
| 1   | 仓库根                   | 跑带覆盖率的 `aiao-desktop-web:test`                 | 生成覆盖率报告，统计范围内每个文件的行与语句 ≥ 80% | ⬜   |
| 2   | CI 测试 lane             | 观察 web 的覆盖率任务                                | 低于门槛的改动在合并前失败，报出具体文件与差值     | ⬜   |
| 3   | 人为去掉某核心文件的覆盖 | 跑门禁                                               | 失败信息指出文件与差值，不是整包静默               | ⬜   |
| 4   | 门槛接入后               | 跑 `pnpm nx run aiao-desktop:verify --skip-nx-cache` | 覆盖率任务随聚合门禁通过，总时长可接受             | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：第 1、3 条由 `pnpm nx run aiao-desktop-web:test` 的实跑覆盖（覆盖率与逐文件门槛默认开启，配置在 `aiao-desktop/apps/web/vitest.config.mts`）。第 1 条看整份运行的覆盖率表与退出码：统计范围内每个文件的行与语句均 ≥ 80%，排除项只有 `services/photo-encoder.ts` 与 `data/sqlite-wasm.worker.ts` 两个只能在浏览器里运行的胶水文件，理由逐条写在配置里。第 3 条在 `aiao-desktop/apps/web` 下跑 `pnpm exec vitest --exclude src/app/services/window-manager.spec.ts`（人为去掉窗口管理的单测）：退出码为 1，报 `ERROR: Coverage for lines (2.24%) does not meet global threshold (80%) for src/app/services/window-manager.ts`，实际值与门槛之差即缺口。单跑带文件过滤时加 `--coverage.enabled=false`，否则没跑到的文件按 0% 触发门槛。补测的 spec：窗口管理 `services/window-manager.spec.ts`、`services/desktop-window.spec.ts`；FileSystem 与磁盘层 `services/file-system.spec.ts`、`disk/rxdb-disk-store.spec.ts`、`disk/disk-store.spec.ts`、`disk/protected-store.spec.ts`、`disk/application-projection.spec.ts`；终端同步 `vm/disk-vm-sync.spec.ts`、`vm/virtual-machine.spec.ts`、`vm/coreutils.spec.ts`、`vm/vm-fs.spec.ts`；会话状态 `services/session.spec.ts`；数据层 `data/desktop-data.spec.ts`、`data/desktop-database.spec.ts`、`data/preferences.spec.ts`、`data/live-query.spec.ts`、`data/schema-inspector.spec.ts`、`data/seeds.spec.ts`；其余服务（主题、系统设置、菜单、浮层、日历、天气、壁纸、应用目录等）的 spec 与之同目录。Angular 服务在 Node 里经 TestBed 注入，脚手架与替身放在 `aiao-desktop/apps/web/src/app/testing/`。第 2 条由 CI 测试 lane（`nx run-many -t test --coverage`）的失败与通过各一轮覆盖；第 4 条由聚合门禁的实跑覆盖（`aiao-desktop:verify` 已依赖 `aiao-desktop-web:test`）。覆盖率数字记录进验收台账。

## 技术笔记

- web 现有的单测集中在磁盘层（路径、目录树、种子、存储后端）、终端同步（内存磁盘加假虚拟机）与各应用的数据转换；窗口管理与界面组件目前只由冒烟覆盖，是本故事的补测重点。
- Node 环境下的 vitest 覆盖率沿用现有假实现（内存磁盘、假虚拟机），浏览器专有路径不进覆盖率统计。
- 接入方式参考仓库 coverage-gate 的用法；`aiao-desktop` 的 `test`/`verify` 目标把覆盖率任务接入依赖。

## 实现文件

- `aiao-desktop/apps/web/vitest.config.mts` — 覆盖率配置与阈值。
- `aiao-desktop/project.json` — test / verify 目标接线。
- `aiao-desktop/apps/web/src/app/services/` 各 spec — 补齐窗口管理等单测。

## References

- [ADESK-US-102 本地数据与真实磁盘](../desktop/ADESK-US-102-local-data-and-real-disk.md)
- [验收台账](../../verification-report.md)
