---
id: RV-071
title: Angular 编辑器后到 value 覆盖已经接管的表单模型
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
baseline: 44de1138b4d396fc45d6e76ab60476c40fef2223
---

# RV-071：Angular 编辑器后到 value 覆盖已经接管的表单模型

## 问题与影响

**P2，当前复验确认，待修。** README/TSDoc承诺 value 与 ngModel/FormControl 同绑以表单为准。writeValue初始化正确，但后来的 input ngOnChanges 无条件 dispatch 文档；External 标记又不回写模型，造成表单模型与可见文档分叉。

## 根因与锚点

[生产源码](../../packages/code-editor-angular/src/code-editor.ts)：246–247、297–305、333–342、406–420；[详细子任务阅读与边界](evidence/2026-10-05/parallel/frontends/findings.pending.md)。源码行属于本轮输入，不以旧行号指代未来改动。

## 实际复验与限定

真实 Angular/CVA/CodeMirror，ngModel和真实FormControl两条负向失败；仅value正常对照通过。观测模型初值/表单更新与文档后到输入不一致，不扩成纯value、纯forms或三端全坏。

[新增复验](../../packages/code-editor-angular/src/__tests__/review-parallel-form-value.spec.ts) / [集中复验原日志](evidence/2026-10-05/parallel/validation/new-parallel-probes.txt)。extension/HTTP新测试随后修正原spec目标库缺Promise.withResolvers及缺显式sync配置的类型问题，类型修复不改业务；对应 [修正夹具后的复验](evidence/2026-10-05/parallel/validation/corrected-new-probes.txt) 以实际状态为准。原失败日志不删除，红测试不skip。

## 最小修法与回归

记录表单接管的值所有权，在CVA持有模型时不让普通value输入反向覆盖；保留无forms单向value行为、访问状态和差量更新，补初始化前/后writeValue与回调隔离。

## 解决记录

- [x] 主控实际失败与成功对照/公开契约核对，按同根因去重。
- [ ] 修复业务和补遗漏边界；评审完成不等于已修/发布就绪。
