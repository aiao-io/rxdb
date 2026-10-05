---
id: RV-077
title: Angular 搜索 README 的 required input 用法在构造时失败
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
---

# RV-077：Angular 搜索 README 的 required input 用法在构造时失败

## 问题

**P2，独立消费/公开路径已复验，待修。** README在字段初始化器中对 input.required<RxDB>() 调useSearch(signal)。helper同步install(untracked(readSource),...)读取尚未被父组件绑定的必填signal，创建组件即NG0950，来不及setInput。

## 根因与边界

[源锚点](../../packages/rxdb-plugin-search-angular/src/inject-search.ts)：94、166；README 48–52。这份记录只覆盖实测分支，不将类型环境或夹具故障泛化为全部框架失效。

## 实际复验

使用真实Angular、当前发布tar/rootpeer0.0.26；修正非相关默认audit延迟后13例中12通过，仅README required input创建断言失败。捕获时尚未运行搜索IO，不声称整个Angular树或其它非必填模式都坏。

[原始证据](evidence/2026-10-05/parallel-round2/validation/isolated-rxdb-plugin-search-angular-lifecycle.txt)；[显式环境的正反类型对照](evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)。运行的是当前发布根真实tar，不是源码alias；代码/测试输入与同批验证清单保存，旧错配环境日志保留但不作为此条新缺陷依据。

## 修复方向与回归

将依赖输入的初始化推迟到框架输入可用的生命周期，或明确收窄公开合同并同步README；不要用任意setTimeout重试或要求用户改变所有正常必填组件结构来掩盖。回归必填source/options、默认值、参数换代和销毁前未初始化。

## 解决记录

- [x] 原场景、公开合同与对应失败/正常对照核对并登记。
- [ ] 实现修复与范围内回归；助手本轮不改业务/依赖或自动提交。
