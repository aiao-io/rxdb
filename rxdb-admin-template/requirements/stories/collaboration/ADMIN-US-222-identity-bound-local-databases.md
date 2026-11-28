---
id: ADMIN-US-222
title: 本机库按账号隔离：工作台库与团队库按身份命名并绑定
status: Backlog
priority: High
epic: ADMIN-EPIC-005
created: 2026-11-28
updated: 2026-11-28
tags: [admin, local-first, identity, isolation, rxdb]
dependsOn: [ADMIN-US-201]
capabilities: [rxdb:US-035]
---

# 用户故事：本机库按账号隔离

## 作为/我想要/以便

**作为** 在同一台设备上用不同账号登录 Admin 的使用者
**我想要** 每个账号打开自己的本机工作台库与团队库，库记住它属于谁，换了账号就换库
**以便** 上一个账号的本机资产、活动记录与草稿不会出现在下一个账号面前，也不会以下一个账号的身份被导入团队任务

## 背景

- [D-10](../../decisions.md#d-10全站登录与全局会话) 第 4 条：全站登录之后，本机工作台仍按设备共用一个库，同一浏览器换账号仍看得到本机数据，按账号隔离另起一轮评审；[ADMIN-US-201](ADMIN-US-201-supabase-email-otp-session.md) 的范围也写着「本机库这一轮仍按设备共用」。本故事就是那一轮，方向见 [D-11](../../decisions.md#d-11supabase-接入走平台标准层) 第 4 条。
- 平台 [US-035](../../../../requirements/stories/core/US-035-identity-bound-local-database.md)（Done）已交付按身份命名与绑定：`getRxDBIdentityDatabaseName(base, identity)` 得到 `<base>-<16 位摘要>`，名字里不含用户 id；`RxDBOptions.identity` 让库记住身份、打开时核对，对不上抛 `RxDBIdentityMismatchError`、不动本地数据、不自动改绑。
- 工作台现状：三端 `setup_rxdb.ts` 用测试包 `@aiao/rxdb-test` 的 `getE2eDbName(config.dbName)` 取库名（e2e 下换成隔离名，生产返回原名），`context.userId` 固定为 `ANONYMOUS_LOCAL_USER_ID = 'userId'`，没有 `identity`。
- 团队库现状：协作包 `teamDatabaseName()` 把 `[userId, teamId, appId]` 散列进库名（cyrb128，非密码学散列，只为压短库名），没有 `identity` 绑定；隔离靠库名与运行时检查。
- 产品尚未部署：现在改库名不涉及线上用户的数据；上线之后再改，就要给真实设备写迁移。

## 范围边界

### In Scope

- 工作台库名 = `getRxDBIdentityDatabaseName(三端 app.config.json 的 dbName, 当前身份)`，并以同一身份开启 `identity` 绑定。身份的 `scope` 与适配器报告的口径逐字相同（Supabase 项目 URL 的 origin），`subject` 为登录用户 id。
- 团队库开启同一身份的 `identity` 绑定；库名继续区分团队与应用，并满足 sqlite-wasm idb VFS 的库名上限。
- 生产代码不再从 `@aiao/rxdb-test` 取库名。e2e 每个浏览器上下文仍各用一个库：自动化环境（`navigator.webdriver`）下改用一个短的基础名，保证加上 17 字节身份后缀之后仍在 sqlite-wasm 的库名上限内（原来的隔离名本身就有 36 字节）。
- 换账号（退出后另一个账号登录、另一个标签页换号）时不再沿用旧账号的库：登录成功后整页载入目标地址，按新身份打开它自己的库；运行中的页面发现会话换了人就重新载入。旧账号的库原样保留在本机。
- 连接前恢复入口与备份导出按当前账号的库工作；匿名数据导入（[ADMIN-US-204](ADMIN-US-204-local-context-explicit-import.md)）读的是当前账号的工作台库。
- 旧的设备共用库（`admin-workbench`、`admin-workbench-ng`、`admin-workbench-vue`）直接弃用：不再打开、不迁移、也不删除，留在浏览器存储里。需要旧数据的人在升级之前用现有的备份导出带走。
- Angular / React / Vue 同一行为、同一组 e2e。

### Out of Scope

- 「从此设备移除此账户数据」与退出后旧库保留多久（平台 epic-015 待冻结的决策 2）。
- 本机库加密：本故事防的是误混，不是同一台设备上的其他人读盘。
- 会话层本身的替换：由 [ADMIN-US-223](ADMIN-US-223-platform-supabase-session.md) 承接，本故事的身份暂取自协作包 `AuthSession` 的当前用户，口径与之后的平台会话层相同。

## 已定的决策

2026-11-28 owner 定：

1. **旧的设备共用库直接弃用**（原候选 A「预览后导入」、B「归第一个登录的账号」、C「直接弃用」中的 C）。产品尚未部署，受影响的只有开发者本机的数据；A 要新增旧库探测、三端导入横幅与专门造旧库的 e2e 设施，B 会把数据交给偶然先登录的人。
2. **工作台审计身份不变**：`createdBy` / `updatedBy` 继续写 `'userId'`（D-10 第 4 条的口径）。库已按账号分开，归属由库本身表达，不需要靠审计字段区分。

## 验收标准

| #   | 前置条件                                    | 操作                         | 预期结果                                                                      | 状态 |
| --- | ------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------- | ---- |
| 1   | 账号 A 登录                                 | 打开工作台并录入数据         | 库名由 A 的身份派生；库记下 A 的身份                                          | ⬜   |
| 2   | 同一浏览器里 A 退出、B 登录                 | 打开工作台、搜索与 Dashboard | 只看到 B 的数据；A 的库原样保留，A 重新登录后数据都在                         | ⬜   |
| 3   | 以 A 的身份打开 B 的库（篡改配置或库名）    | 打开                         | 报身份不匹配，不读不写，本地数据不动                                          | ⬜   |
| 4   | 两个标签页都以 A 打开，其中一个退出并换成 B | 另一个标签页继续操作         | 它随之回到登录页或换到 B 的库；换之前的写入只落在 A 的库，没有写进 B 的库     | ⬜   |
| 5   | A 打开过团队任务                            | 换成 B 后打开同一团队的任务  | 打开 B 自己的团队库；A 的团队库与草稿保留，B 读不到                           | ⬜   |
| 6   | 本机有旧的设备共用库                        | 首次登录并打开工作台         | 打开的是按身份命名的新库；旧库不被打开、不被改写、也不被删除                  | ⬜   |
| 7   | 有账号 A 导出的备份档                       | 在 A 下恢复；在 B 下恢复     | A 下恢复到 A 的库；B 下恢复写入 B 的库，不覆盖 A 的库                         | ⬜   |
| 8   | 三端                                        | 跑本故事与既有的 e2e         | 结果一致；各浏览器上下文的库互不相通；生产代码不再从 `@aiao/rxdb-test` 取库名 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：随实现补齐。

## 技术笔记

- 库名长度：sqlite-wasm idb VFS 的库名上限约 41 字节（根 roadmap「零散收尾项」第 6 条），按身份派生的名字比基础名多 17 字节；三端基础名最长是 `admin-workbench-vue`（19 字节），在上限内。团队库名要同时区分团队、应用与身份，按同一上限设计；协作包已有的长度校验（`teamDatabaseNameLimit`）保留到平台 US-237 的库名校验接手。
- 交付后 D-03 的「默认数据库名 `admin-workbench`」改作基础名；偏好前缀 `aiao.workbench` 仍按设备共用（外观与布局偏好不涉及业务数据）。
- 三端都是根组件在启动时同步建库并注入（React 顶层、Angular `provideRxDB`、Vue `provideRxDB`），登录页也挂在同一个根下。所以不改注入结构：启动时用会话缓存下的身份与公开配置同步算出库名；没有身份时建一个不注册本地适配器的占位实例，谁误连它都会当场报错，而登录门禁之外本来就没有页面会连库。登录成功后整页载入目标地址，换号即换库。
- React 的搜索页 loader 与布局路由的登录门禁并行执行，改成先等门禁放行再连库。

## 实现文件

- `rxdb-admin-template/apps/{react,angular,vue}/src/app/rxdb/setup_rxdb.ts` — 工作台库名与身份绑定
- `rxdb-admin-template/packages/collaboration/src/client/team-database.ts` — 团队库身份绑定
- `rxdb-admin-template/apps/react-e2e/src/` — 三端共用的 e2e

## References

- [平台 US-035 每个身份一个本地库](../../../../requirements/stories/core/US-035-identity-bound-local-database.md)
- [Supabase 接入标准化计划](../../plans/supabase-standardization-tasks.md)
- [ADMIN-EPIC-005](../../epics/ADMIN-EPIC-005.md)
