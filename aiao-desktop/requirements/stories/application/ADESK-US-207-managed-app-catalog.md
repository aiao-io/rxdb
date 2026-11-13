---
id: ADESK-US-207
title: 受管应用目录：安装、更新与回退
status: Backlog
priority: Low
epic: ADESK-EPIC-003
created: 2026-11-13
updated: 2026-11-13
tags: [application, catalog, orbit, lifecycle]
dependsOn: [ADESK-US-202, ADESK-US-205]
capabilities: []
---

# 用户故事：受管应用目录：安装、更新与回退

## 作为/我想要/以便

**作为** 使用 Aiao Desktop 的人或运营方
**我想要** 应用目录支持安装、更新、卸载与回退
**以便** 新应用不必等桌面重新构建发布就能上架，也能及时下架，已安装的应用不受影响。

## 范围边界

### In Scope

- 受管目录：目录清单是静态文件（随桌面发布或运营托管的 HTTPS 地址，不含密钥，[D-03](../../decisions.md#d-03只有前端不带任何密钥)），条目经 [D-10](../../decisions.md#d-10应用分三类登记在同一张表里) 与 [D-12](../../decisions.md#d-12集成应用的接入契约) 校验；用户不能填任意网址。
- 安装、卸载、更新、回退：安装后入口出现在 Applications、Launchpad、Spotlight 与 Dock（[ADESK-US-205](ADESK-US-205-application-management.md) 的投影）；卸载后入口消失、窗口不可再开，不删用户文件；更新生效后刷新仍在；回退到上一可用版本。
- 目录不可达时的降级：已安装应用照常打开，目录页给出失败与重试，桌面不报错。
- 与 US-205 的边界：US-205 是「随构建发布的清单」，本故事是「运营发布的目录」叠加在清单之上，安装结果（安装集与版本）是本地 SQLite 数据。

### Out of Scope

- 用户自行输入网址安装任意 Web 应用；商店评分、付费与账号。
- 代码签名与恶意应用防护（仍是 Orbit 的运营信任模型，[D-11](../../decisions.md#d-11集成应用经-orbit-隔离运行)）。
- 远程下载并执行任意二进制。

## 验收标准

| #   | 前置条件                             | 操作                                 | 预期结果                                                                     | 状态 |
| --- | ------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------- | ---- |
| 1   | 目录源返回含新应用 A 的清单          | 打开应用目录并安装 A                 | A 出现在 Applications、Launchpad 与 Spotlight，打开后经 Orbit 运行，入口与权限来自目录且经 D-12 校验 | ⬜    |
| 2   | A 已安装，目录发布 A 新版本          | 触发更新                             | 新版本生效，刷新后仍是新版本                                                 | ⬜    |
| 3   | A 已安装                             | 卸载 A                               | 各入口消失，已开窗口关闭后不可再开，用户文件不删                             | ⬜    |
| 4   | 目录源不可达                         | 打开桌面与应用目录                   | 已安装应用照常打开，目录页显示失败与重试，没有页面错误                       | ⬜    |
| 5   | 目录含非法条目（未批准来源、缺字段） | 加载目录                             | 非法条目被拒绝并记录，不影响其余条目（D-10 校验复用）                        | ⬜    |
| 6   | A 更新后                             | 回退 A                               | 上一可用版本恢复，入口与权限回到回退版本                                     | ⬜    |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：第 1～6 条由 `aiao-desktop-e2e:e2e` 的应用目录检查组覆盖（替身目录源与替身应用，外网拦截）；第 5 条的校验逻辑复用 US-201 的单测夹具。对线上真实目录的验收随目录上线补一轮。

## 技术笔记

- 目录在 US-205 的「清单为唯一真相源」之上增加一层运行时可变的安装集，持久化在本地 SQLite；桌面构建清单仍然是批准边界。
- Orbit 权限、ready 超时与失败重试复用 [ADESK-US-202](ADESK-US-202-integrated-app-runtime.md) 与 D-12 的既有实现；回退需要目录保留上一版本入口，或本地缓存清单版本。
- 目录 UI 复用现有 `appstore` 应用（目前是书架占位组件），不作为新的系统入口。

## 实现文件

- `aiao-desktop/apps/web/src/app/services/application-catalog.ts` — 目录清单、安装集与版本。
- `aiao-desktop/apps/web/src/app/apps/appstore/` — 目录界面。
- `aiao-desktop/apps/e2e/src/smoke.mjs` — 应用目录检查项。

## References

- [ADESK-US-205 Applications 目录、预装应用与 Dock 管理](ADESK-US-205-application-management.md)
- [ADESK-US-202 集成应用的运行宿主](ADESK-US-202-integrated-app-runtime.md)
- [D-10 应用分三类，登记在同一张表里](../../decisions.md#d-10应用分三类登记在同一张表里)
- [D-17 应用清单是唯一真相源，Applications 是系统投影](../../decisions.md#d-17应用清单是唯一真相源applications-是系统投影)
