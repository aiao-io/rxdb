---
id: US-907
title: DevTools 面板迁移后的人工浏览器回归
status: Backlog
priority: Low
epic: epic-003-ui-developer-tools
created: 2026-09-05
updated: 2026-09-05
tags: [devtools, chrome, manual-regression]
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

# 用户故事：DevTools 面板迁移后的人工浏览器回归

> 从 [US-904](./US-904-devtools-native-storage-contract.md) 拆出。US-904 的阶段 A～D 全部有自动化证据并已关闭，
> 剩下四条 AC 的判据本身就是「人在真实 Chrome 里看」：要么需要两份不同版本的真实扩展产物，要么需要观察
> service worker 重启后的 UI。把它们留在 US-904 里只会让一条 875 行的故事永远停在 In Progress。
> 本故事**不改代码**，只产出回归记录；发现缺陷另开故事。

## 作为/我想要/以便

**作为** 维护 DevTools 扩展的开发者
**我想要** 一份在真实 Chrome 上逐条过完的回归记录
**以便** 确认 v2 迁移对既有用户「看不出区别」，而不是只靠 e2e 里的 fake relay 说它没区别

## 范围边界

### In Scope

- 在真实 Chrome + 真实扩展产物上执行下表四条，记录观察结果与产物版本
- 跨版本对照需要的两份产物：从 `main` 上最近一个已发布 tag 构建旧版，从当前 HEAD 构建新版

### Out of Scope

- 任何代码修改；发现的缺陷各自另开故事
- Electron / Tauri 侧的人工回归（分别归 US-904 阶段 D 与 US-905）

## 验收标准

| #   | 前置条件                                                                    | 操作                                                              | 预期结果                                                                                                   | 状态 |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 抽取前的浏览器回归基线已记录（US-904 AC#34）                                | 抽取后重跑 Database、Events、branch、Storage、OPFS、Settings 清理 | 用户可见行为、wire 消息与错误展示与基线一致；C1 不引入任何协议或行为差异                                   | ⬜   |
| 2   | new panel/old connector 与 old panel/new connector 两份产物（US-904 AC#38） | 分别通过真实扩展 relay 调试既有页面                               | 前者窗口到期后 bridge，后者无等待 facade；既有页面可用且都不获得 v2/provider 新能力                        | ⬜   |
| 3   | 双方版本无交集、service worker 重启、页面刷新和 Port 重连（US-904 AC#39）   | 观察 UI 与 session                                                | 可见 `protocol_unsupported` 或确定重连；旧订阅、请求、transfer、snapshot、计时器清理，迟到消息不进入新状态 | ⬜   |
| 4   | readonly/full 普通 Chrome 页面使用现有 Web adapters（US-904 AC#42）         | 查询、事件、branch、OPFS、Storage 与 Settings 清理                | 除数据库下载和超过协商上限的传输明确拒绝外，用户可见行为不变                                               | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- 回归记录写进本故事的 References，格式：Chrome 版本、扩展产物 commit、每条 AC 的观察截图或文字。
- 旧版产物用 `git worktree add ../rxdb-old v0.0.25 && pnpm nx build rxdb-devtools-extension` 得到，不要在同一工作副本里来回切 tag。

## 实现文件

- 无代码改动。产出物只有回归记录。

## References

- [US-904 DevTools 原生本地存储调试](./US-904-devtools-native-storage-contract.md)
