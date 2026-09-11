---
id: US-907
title: DevTools 面板迁移后的人工回归
status: Backlog
priority: Low
epic: epic-003-ui-developer-tools
created: 2026-09-05
updated: 2026-09-11
tags: [devtools, chrome, electron, manual-regression]
inherited_acs:
  - from: US-904
    ac: 34
    note: C1 面板抽取后的浏览器回归基线对照，只能由人工在真实 Chrome 里做
  - from: US-904
    ac: 38
    note: new panel/old connector 与 old panel/new connector 的跨版本互通，需要两份真实构建产物
  - from: US-904
    ac: 39
    note: service worker 重启 / 页面刷新 / Port 重连下的 UI 与 session 观察
  - from: US-904
    ac: 42
    note: readonly/full 普通 Chrome 页面走既有 Web adapters 的可见行为不变
  - from: US-906
    ac: 2
    note: 只迁人工半边——按文档跑一次 nx dev 流程并打开面板；机器半边已由 US-904 AC#52 的 e2e 关闭
---

<!--
INVEST 检查清单:
- [x] Independent: 只消费 US-904 已交付的产物，不改任何代码
- [x] Negotiable: 回归清单的粒度与记录格式可议；「必须在真实 Chrome + 真实扩展产物上做」不可议
- [x] Valuable: 四条 AC 是 US-904 里唯一没有自动化证据的部分，不做它们 v2 迁移的「行为中性」只是断言
- [x] Estimable: 四条 AC、一份 checklist、一次跨版本产物对照
- [x] Small: 半天人工工作
- [x] Testable: 每条 AC 有明确的观察项与通过判据
-->

# 用户故事：DevTools 面板迁移后的人工回归

> 从 [US-904](./US-904-devtools-native-storage-contract.md) 拆出，另承接
> [US-906](./US-906-electron-devtools-developer-path.md) AC#2 的人工半边。这些 AC 的判据本身就是
> 「人在真实 Chromium DevTools 里看」：要么需要两份不同版本的真实扩展产物，要么需要观察 service worker
> 重启后的 UI，要么需要人按文档手跑一遍开发流程。把它们留在源故事里，只会让已经有全部自动化证据的
> 故事因为一条人工 AC 永远停在 In Progress。
> 本故事**不改代码**，只产出回归记录；发现缺陷另开故事。

## 作为/我想要/以便

**作为** 维护 DevTools 扩展的开发者
**我想要** 一份在真实宿主里逐条过完的回归记录（前四条在 Chrome，第五条在 Electron dev 流程）
**以便** 确认 v2 迁移对既有用户「看不出区别」，而不是只靠 e2e 里的 fake relay 说它没区别

## 范围边界

### In Scope

- 在真实 Chrome + 真实扩展产物上执行下表前四条，记录观察结果与产物版本
- 跨版本对照需要的两份产物：从 `main` 上最近一个已发布 tag 构建旧版，从当前 HEAD 构建新版
- 在 Electron dev 流程上人工确认一次面板可用（AC#5，承接 US-906 AC#2）

### Out of Scope

- 任何代码修改；发现的缺陷各自另开故事
- Tauri 侧的人工回归（归 [US-905](./US-905-tauri-native-devtools.md)）
- US-906 AC#2 的**机器半边**——已由 US-904 AC#52 的 e2e 关闭，不在这里重跑

## 验收标准

| #   | 前置条件                                                                    | 操作                                                                                                    | 预期结果                                                                                                                                                            | 状态 |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 抽取前的浏览器回归基线已记录（US-904 AC#34）                                | 抽取后重跑 Database、Events、branch、Storage、OPFS、Settings 清理                                       | 用户可见行为、wire 消息与错误展示与基线一致；C1 不引入任何协议或行为差异                                                                                            | ⬜   |
| 2   | new panel/old connector 与 old panel/new connector 两份产物（US-904 AC#38） | 分别通过真实扩展 relay 调试既有页面                                                                     | 前者窗口到期后 bridge，后者无等待 facade；既有页面可用且都不获得 v2/provider 新能力                                                                                 | ⬜   |
| 3   | 双方版本无交集、service worker 重启、页面刷新和 Port 重连（US-904 AC#39）   | 观察 UI 与 session                                                                                      | 可见 `protocol_unsupported` 或确定重连；旧订阅、请求、transfer、snapshot、计时器清理，迟到消息不进入新状态                                                          | ⬜   |
| 4   | readonly/full 普通 Chrome 页面使用现有 Web adapters（US-904 AC#42）         | 查询、事件、branch、OPFS、Storage 与 Settings 清理                                                      | 除数据库下载和超过协商上限的传输明确拒绝外，用户可见行为不变                                                                                                        | ⬜   |
| 5   | dev 变体扩展已构建，`nx serve dev-rxdb-electron` 已起在 4120（US-906 AC#2） | 按 `apps/rxdb-devtools-extension/README.md` 启动 `nx dev dev-rxdb-electron`，打开 DevTools 的 RxDB 面板 | 面板进入 `granted`、四段 relay 握手完成、Database 页读到真实实体行；README 的两条排查（`nx serve` 必须另起一个终端、`env -u ELECTRON_RUN_AS_NODE`）按文照做即可走通 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- 回归记录写进本故事的 References，格式：Chrome 版本、扩展产物 commit、每条 AC 的观察截图或文字。
- 旧版产物取 **`main` 上最近一个已发布 tag**（`git describe --tags --abbrev=0 main`，先用
  `git merge-base --is-ancestor <tag> main` 确认它真是祖先——仓库里存在不在 `main` 上的 tag），
  用 `git worktree add ../rxdb-old <tag> && pnpm nx build rxdb-devtools-extension` 构建，
  不要在同一工作副本里来回切 tag。
- AC#5 是**人工**判据：它要验的正是「照着文档走，人能不能走通」，用脚本代跑就把被验对象换掉了。

## 实现文件

- 无代码改动。产出物只有回归记录。

## References

- [US-904 DevTools 原生本地存储调试](./US-904-devtools-native-storage-contract.md)
