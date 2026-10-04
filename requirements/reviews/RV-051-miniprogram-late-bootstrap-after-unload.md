---
id: RV-051
title: 小程序页面卸载后迟到的初始化结果未释放
status: Open
severity: P2
created: 2026-10-04
updated: 2026-10-04
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
---

# RV-051：小程序页面卸载后迟到的初始化结果未释放

## 问题

🔴 **P2，确认页面生命周期问题，待修复。** onLoad 启动异步 demo 引导；若页面在引导完成前 onUnload，demoRef 仍为空，卸载回调没有资源可释放。随后 open 返回，旧 start 继续保存 demo、查询 Todo、启动 reconnect，没有检查页面已卸载，也没有释放这个迟到的实例。

## 根因

[index.tsx](../../apps/dev-rxdb-miniprogram/src/pages/index/index.tsx) 第 98–125 行的 start 跨多个 await，open 之后直接写 demoRef/state 并继续验证。第 128–134 行 useUnload 只处理当时已有 demo，没有 cancelled/generation 标记，没有接管 pending open。

[rxdb-demo.ts](../../apps/dev-rxdb-miniprogram/src/rxdb-demo.ts) 会在 connect 后登记 activeDemo；“下次 open 先 releaseActiveDemo”不能保证旧页面卸载后立即停机——可能根本没有下次页面启动。也不能用框架忽略卸载后的 setState 代替数据库资源清理。

## 复验与测量限制

[新增 Node 生命周期 spec](../../apps/dev-rxdb-miniprogram-e2e/src/review-page-bootstrap-lifecycle.spec.ts) 用 TypeScript 编译实际页面源文件，执行原函数及原 useLoad/useUnload 回调；React/Taro hooks、preflight、open/demo 是明确测试接缝，使用 gate 控制卸载与 open 的先后，未复制一个手写 start 实现。

**1 failed /1 passed**：[日志](evidence/2026-10-04/generator-graph-miniprogram/mini-page-bootstrap-lifecycle.txt)。先 unload 后 open 时 dispose=0，仍调用 listTodos；先 ready 后 unload 的对照 dispose=1。失败没有被重试成绿。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run dev-rxdb-miniprogram-e2e:e2e-devtools --args='src/review-page-bootstrap-lifecycle.spec.ts --workers=1 --retries=0' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

target 名叫 e2e-devtools，但本 spec 只使用 Playwright Node runner，没有引入真实 DevTools fixture。**不是微信 GUI/真机、真实 React/Taro 调度或 Native VFS 泄漏量实测**；已证明当前页面回调在合法的异步顺序中未履行迟到结果释放。正常 DevTools 的历史 16 passed 不覆盖这个受控卸载窗口。

## 修复方案

页面对当前引导持有明确 epoch/cancelled 状态。useUnload 推进/终止该状态；每个异步结果在写 ref/state、查询/重连之前复核归属，迟到成功结果由引导自己立即 dispose。多个 start 竞争时旧结果也不能接管新页面。

不要仅屏蔽 setState warning 或全局只保留最新 ref；补 open 期间 unload、reLaunch 旧/新页面交错、连接失败、重复 start 与 dispose 拒绝的真实 DevTools 补证。

## 解决记录

- [x] 原页面源码执行与正常卸载对照保留，业务实现未改。
- [ ] 实现 pending bootstrap 的取消/归属与迟到释放。
- [ ] 真实微信宿主/React 调度补证；当前 Open。
