---
id: RV-072
title: DevTools 旧页面授权迟到覆盖导航与销毁状态
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
baseline: 44de1138b4d396fc45d6e76ab60476c40fef2223
---

# RV-072：DevTools 旧页面授权迟到覆盖导航与销毁状态

## 问题与影响

**P2，当前复验确认，待修。** requestAccess 对旧origin挂起；导航refresh或销毁已推进revision，但requestAccess不捕获/检查revision。旧grant=true随后把当前不支持页面状态置为granted，或在服务销毁后仍activate当前tab。

## 根因与锚点

[生产源码](../../apps/rxdb-devtools-extension/src/devtools/services/inspected-page-access.service.ts)：46–49、61–83、100–121；[详细子任务阅读与边界](evidence/2026-10-05/parallel/frontends/findings.pending.md)。源码行属于本轮输入，不以旧行号指代未来改动。

## 实际复验与限定

真实Angular service状态/调用与deferred Chrome API接缝：导航到unsupported和销毁两条失败，未导航一条对照通过。不是Chrome原生权限UI复验，更不是已证明host权限绕过/特权注入成功。

[新增复验](../../apps/rxdb-devtools-extension/src/devtools/services/review-parallel-access-navigation.spec.ts) / [集中复验原日志](evidence/2026-10-05/parallel/validation/new-parallel-probes.txt)。extension/HTTP新测试随后修正原spec目标库缺Promise.withResolvers及缺显式sync配置的类型问题，类型修复不改业务；对应 [修正夹具后的复验](evidence/2026-10-05/parallel/validation/corrected-new-probes.txt) 以实际状态为准。原失败日志不删除，红测试不skip。

## 最小修法与回归

requestAccess与refresh共用revision和pattern身份；await后只允许本轮有效导航更新状态/激活，销毁撤销旧结果。补拒绝、contains慢回、同origin和request reject，不扩成all_urls或延时重试。

## 解决记录

- [x] 主控实际失败与成功对照/公开契约核对，按同根因去重。
- [ ] 修复业务和补遗漏边界；评审完成不等于已修/发布就绪。
