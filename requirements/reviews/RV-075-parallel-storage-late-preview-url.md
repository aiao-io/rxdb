---
id: RV-075
title: storage 销毁后迟到读取仍登记新的对象 URL
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
baseline: 44de1138b4d396fc45d6e76ab60476c40fef2223
---

# RV-075：storage 销毁后迟到读取仍登记新的对象 URL

## 问题与影响

**P2，当前复验确认，待修。** preview/createObjectUrl读取blob挂起，destroy只等待activeWrites并清registry。read完成后没有lifecycle复核，仍registry.create，已销毁服务重新持有Blob/URL，旧destroy不会再回收这次登记。

## 根因与锚点

[生产源码](../../packages/rxdb-plugin-storage/src/storage.service.ts)：329–346、648–659；[详细子任务阅读与边界](evidence/2026-10-05/parallel/plugins/findings.pending.md)。源码行属于本轮输入，不以旧行号指代未来改动。

## 实际复验与限定

实际storage service与OPFS实现，已有memory metadata/FileSystem handle接缝、只控制readBlob返回；两迟到负向失败、已完成URL回收对照通过。不是实际浏览器OPFS持久/内存剖析证明。历史RV-043是fetch响应体取消，Git删除记录9c109ed2确认不同根因，未重复登记。

[新增复验](../../packages/rxdb-plugin-storage/src/__tests__/review-parallel-preview-lifecycle.spec.ts) / [集中复验原日志](evidence/2026-10-05/parallel/validation/new-parallel-probes.txt)。extension/HTTP新测试随后修正原spec目标库缺Promise.withResolvers及缺显式sync配置的类型问题，类型修复不改业务；对应 [修正夹具后的复验](evidence/2026-10-05/parallel/validation/corrected-new-probes.txt) 以实际状态为准。原失败日志不删除，红测试不skip。

## 最小修法与回归

在URL创建前确认服务仍属有效生命周期，或让读/URL生成成为销毁必须接管的任务；两公开方法对称，仍回收已有URL。补重复destroy、读取失败、消费者dispose/revoke及真实浏览器。

## 解决记录

- [x] 主控实际失败与成功对照/公开契约核对，按同根因去重。
- [ ] 修复业务和补遗漏边界；评审完成不等于已修/发布就绪。
