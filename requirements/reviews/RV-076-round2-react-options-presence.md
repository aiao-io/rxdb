---
id: RV-076
title: React 搜索绑定丢失 undefined 与空 options 的输入差异
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
---

# RV-076：React 搜索绑定丢失 undefined 与空 options 的输入差异

## 问题

**P2，独立消费/公开路径已复验，待修。** React rerender 从 options=undefined 变为 {}；useMemo 的依赖只有各字段值，两次全为 undefined，快照继续保持旧 undefined，source.search 未重建。shared searchOptionsEqual 明确将这两者判不等，且公开结构 source 可以按有/无显式 options 使用不同配置。

## 根因与边界

[源锚点](../../packages/rxdb-plugin-search-react/src/use-search.ts)：55–66 useStableSearchOptions。这份记录只覆盖实测分支，不将类型环境或夹具故障泛化为全部框架失效。

## 实际复验

修正控制审计0与根StrictMode后，独立当前published tar 0.0.26环境13例中12通过、仅此例失败；source.search期望2次实际1。不是旧core0.0.25缺API的干扰。

[原始证据](evidence/2026-10-05/parallel-round2/validation/isolated-rxdb-plugin-search-react-lifecycle.txt)；[显式环境的正反类型对照](evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)。运行的是当前发布根真实tar，不是源码alias；代码/测试输入与同批验证清单保存，旧错配环境日志保留但不作为此条新缺陷依据。

## 修复方向与回归

将options是否undefined纳入稳定快照的依赖/一致性判据，继续按语义字段去重，不因每个新对象引用重建。保留initialQuery首次播种、不重置用户query及A→B所有权。

## 解决记录

- [x] 原场景、公开合同与对应失败/正常对照核对并登记。
- [ ] 实现修复与范围内回归；助手本轮不改业务/依赖或自动提交。
