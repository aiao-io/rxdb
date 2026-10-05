---
id: RV-070
title: React 播放器首次 layout effect 的 seek 被丢弃
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
baseline: 44de1138b4d396fc45d6e76ab60476c40fef2223
---

# RV-070：React 播放器首次 layout effect 的 seek 被丢弃

## 问题与影响

**P2，当前复验确认，待修。** 公开 ReplayerRef 在 layout 阶段已交给消费者，父组件首次 layout effect 调 seek(500)；核心 mountReplayer 要到 passive effect 才建立，当前 seek 使用空 handle 的可选调用，命令不进已承诺的 pending seek。README第65行/TSDoc第23行明确加载前seek记住目标。

## 根因与锚点

[生产源码](../../packages/rxdb-plugin-replay-react/src/replayer.tsx)：23、62–78、91–99；[详细子任务阅读与边界](evidence/2026-10-05/parallel/frameworks/findings.pending.md)。源码行属于本轮输入，不以旧行号指代未来改动。

## 实际复验与限定

真实 React 布局时序和既有 MountReplayerSpy：挂载一次后 seek参数应为[[500]]，实际[]。只在边界观察核心调用，不冒充实际 rrweb/browser 时间轴已跑。

[新增复验](../../packages/rxdb-plugin-replay-react/src/__tests__/review-parallel-layout-seek.spec.ts) / [集中复验原日志](evidence/2026-10-05/parallel/validation/new-parallel-probes.txt)。extension/HTTP新测试随后修正原spec目标库缺Promise.withResolvers及缺显式sync配置的类型问题，类型修复不改业务；对应 [修正夹具后的复验](evidence/2026-10-05/parallel/validation/corrected-new-probes.txt) 以实际状态为准。原失败日志不删除，红测试不skip。

## 最小修法与回归

将无 handle 期间的最新 seek 意图交到本次 handle，或用严格对齐消费者时序的挂载阶段；保留 play/pause 加载前空操作，不为全部命令加队列。回归 SSR、StrictMode、卸载和多root。

## 解决记录

- [x] 主控实际失败与成功对照/公开契约核对，按同根因去重。
- [ ] 修复业务和补遗漏边界；评审完成不等于已修/发布就绪。
