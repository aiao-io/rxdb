---
id: RV-074
title: HTTP 合批通知被错误归给最后一个写入者
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
baseline: 44de1138b4d396fc45d6e76ab60476c40fef2223
---

# RV-074：HTTP 合批通知被错误归给最后一个写入者

## 问题与影响

**P2，当前复验确认，待修。** 连续两个写入者的变更被PGlite聚合为一次事件；recordWrite单槽pendingClientId只保留最后一名，整批帧被标成其自回声。该客户端可过滤掉同批另一写入者的变更通知。

## 根因与锚点

[生产源码](../../apps/dev-rxdb-http-server/src/change-broadcaster.ts)：47–68；[详细子任务阅读与边界](evidence/2026-10-05/parallel/integrations/findings.pending.md)。源码行属于本轮输入，不以旧行号指代未来改动。

## 实际复验与限定

原RxDB事件流与原broadcaster、显式frame sink接缝；两作者合批不应使用单一来源的断言失败，单作者回声对照通过。未冒充真实HTTP/SSE网络、未证明数据丢失或永久不收敛。

[新增复验](../../apps/dev-rxdb-http-server/src/__tests__/review-parallel-change-broadcast-origin.spec.ts) / [集中复验原日志](evidence/2026-10-05/parallel/validation/new-parallel-probes.txt)。extension/HTTP新测试随后修正原spec目标库缺Promise.withResolvers及缺显式sync配置的类型问题，类型修复不改业务；对应 [修正夹具后的复验](evidence/2026-10-05/parallel/validation/corrected-new-probes.txt) 以实际状态为准。原失败日志不删除，红测试不skip。

## 最小修法与回归

追踪批次来源集合/每项来源，只有确知整批同一写入者才标其clientId；混合来源不能因一个作者自回声过滤掉其他作者通知。保留单作者抑制，补事务合批/并发/作者缺失及真实网络。

## 解决记录

- [x] 主控实际失败与成功对照/公开契约核对，按同根因去重。
- [ ] 修复业务和补遗漏边界；评审完成不等于已修/发布就绪。
