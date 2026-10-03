---
id: RV-035
title: 严格零警告 lint 门禁有两个项目失败
status: Open
created: 2026-10-03
updated: 2026-10-03
severity: P2
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
---

# RV-035：严格零警告 lint 门禁有两个项目失败

**P2 · 确认问题，待修复**；业务实现未在本轮修改。

## 问题与实测

69 个真实项目执行 `lint --max-warnings=0`，67 个通过、2 个失败：

- `rxdb-model-vue`：**260 warnings**，集中于 Vue attributes-order / html-self-closing 等模板规则。
- `dev-rxdb-vue-e2e`：**2 warnings**，playwright/no-identical-title。

原日志：[full-run/lint.log](evidence/2026-10-03/full-run/lint.log)。这不是 worker/EPIPE，也不能靠默认 ESLint 允许 warning 的退出码当作符合 AGENTS.md。

## 源码证据与根因

[EntityDetail.vue](../../packages/rxdb-model-vue/src/entity-detail/EntityDetail.vue)、[EntityDialog.vue](../../packages/rxdb-model-vue/src/entity-dialog/EntityDialog.vue)、[EntityForm.vue](../../packages/rxdb-model-vue/src/entity-form/EntityForm.vue) 等当前模板顺序/void element 写法与本项目生效规则不一致；日志给出完整范围，不只这三份。

[shared-page-tests.ts](../../apps/dev-rxdb-vue-e2e/src/shared-page-tests.ts) 两个注册函数中重复使用相同字面量标题。**两个函数由不同 suite 调用，本轮没有证明运行时注册了重复 Playwright 用例**；这里确认的是严格 lint 会稳定失败，不能把静态告警放大成运行时重复测试。

## 复验

```bash
CI=true NX_DAEMON=false pnpm nx run-many -t lint --projects=rxdb-model-vue,dev-rxdb-vue-e2e --parallel=1 --max-warnings=0 --skipRemoteCache --skipNxCache
```

## 修复方案

按生效规则最小调整模板属性顺序/void element 表达；给共享注册器使用能区分语义的测试标题，核对现有 grep/报告使用者。不要关闭规则或忽略警告，也不要为这个质量修订扩成组件重写。

## 解决记录

- [ ] 保留失败复验/门禁证据并定位最小修法。
- [ ] 修复后复跑关联回归，不用缓存或跳过换绿。
- [ ] 合并后按评审目录清理规则处理；当前仍 Open。
