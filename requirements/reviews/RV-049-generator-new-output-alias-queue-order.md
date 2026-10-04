---
id: RV-049
title: 生成器首次输出目录的父软链别名绕过串行队列
status: Open
severity: P2
created: 2026-10-04
updated: 2026-10-04
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
---

# RV-049：生成器首次输出目录的父软链别名绕过串行队列

## 问题

🔴 **P2，确认问题，待修复。** 同一物理父目录及其软链别名分别指向尚不存在的 generated 输出目录，先调用生成 Alpha、后调用生成 Beta。若前一个分析较慢，Beta 先完成、Alpha 后覆盖，最终输出退回较早的 Alpha。输出目录已存在的相同对照正确串行，最终 Beta。

## 根因

[resolveQueueKey](../../packages/rxdb-client-generator/src/cli/build-client-lib.ts) 第 249–256 行只对完整 outDir 调 realpathSync。首次目录尚未创建时失败，返回各自词法绝对路径；实际共享位置因此登记到两条 outputQueues。第 272–289 行的每 key FIFO 对这两个别名失效。

writeOutputs 的同步 commit 不意味着调用顺序正确：两个 buildOnce 的异步解析先后不同，完整的较旧结果仍能在较新结果之后提交。不是逐文件提交被同时穿插的另一种问题。

## 复验

[新 spec](../../packages/rxdb-client-generator/src/__tests__/cli/review-new-output-alias-queue.spec.ts) 使用实际 CLI build、实体分析、代码生成、staging/manifest 和真实临时目录/父软链，只在文件发现接缝给第一请求放一个明确 gate。对比 outDir 不存在/已存在两种形态。

**1 failed /1 passed**：[日志](evidence/2026-10-04/generator-graph-miniprogram/generator-alias-queue-final.txt)。首次不存在时 completionOrder=B,A，最终 hasAlpha=true/hasBeta=false；已存在时 A,B，最终 Beta。300ms 只用于放行 gate 前的观测窗口，不以任意 sleep 代替最终 completionOrder/生成文本断言。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb-client-generator:test --args='src/__tests__/cli/review-new-output-alias-queue.spec.ts --run --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

## 修复方案

规范化队列身份时，对最近存在的父目录做 realpath，再拼回尚不存在的后续段；确保目录创建前后、物理路径/父软链别名共用同一个 key。或在同步登记前明确创建/规范化目录，但需维持输入失败不擅自写盘的现有契约。

不删除 FIFO、不只给某个 Vite 调用点加锁。补多级不存在目录、父软链、失败后的下一次构建和目录创建前后混合请求；跨进程同步不在本轮已证明范围。

## 解决记录

- [x] 真实生成输出、manifest、父软链及已存在目录对照保留。
- [ ] 修复队列物理身份，保持既有 CLI/Vite 配置语义。
- [ ] 当前 Open，业务实现未改。
