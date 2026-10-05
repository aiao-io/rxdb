---
id: RV-073
title: cloneDeep 压缩稀疏数组并改变元素索引
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
baseline: 44de1138b4d396fc45d6e76ab60476c40fef2223
---

# RV-073：cloneDeep 压缩稀疏数组并改变元素索引

## 问题与影响

**P2，当前复验确认，待修。** cloneDeep 从空数组开始，forEach跳过hole，再以push写入。length=3且仅index2为tail的数组被克隆成length1/index0，数据结构发生变化，而不是等价深拷贝。

## 根因与锚点

[生产源码](../../packages/utils/src/object/cloneDeep.ts)：77–83；[详细子任务阅读与边界](evidence/2026-10-05/parallel/core/findings.pending.md)。源码行属于本轮输入，不以旧行号指代未来改动。

## 实际复验与限定

原公开cloneDeep，稀疏数组用例失败；密集数组共享引用、自引用两个对照正常。生命周期同目标还有独立红，不能合并为同一根因。

[新增复验](../../packages/utils/src/__tests__/object/review-parallel-clone-array-shape.spec.ts) / [集中复验原日志](evidence/2026-10-05/parallel/validation/new-parallel-probes.txt)。extension/HTTP新测试随后修正原spec目标库缺Promise.withResolvers及缺显式sync配置的类型问题，类型修复不改业务；对应 [修正夹具后的复验](evidence/2026-10-05/parallel/validation/corrected-new-probes.txt) 以实际状态为准。原失败日志不删除，红测试不skip。

## 最小修法与回归

预分配原长度，只写实际存在索引，保留WeakMap预登记和循环/共享引用语义；不能把hole填成undefined，补稳定键/序列化区别。

## 解决记录

- [x] 主控实际失败与成功对照/公开契约核对，按同根因去重。
- [ ] 修复业务和补遗漏边界；评审完成不等于已修/发布就绪。
