---
title: Angular / React / Vue 跨框架 API 交叉复核
status: StaticReview
baseline: main@94df0a04
reviewed: 2026-10-16
---

# 跨框架 API 交叉复核

## 结论

静态对照未确认新的 P0–P2 跨框架缺陷。搜索、树查询、Working Tree 三组的入口导出和共享类型完整对齐；Replay、Code Editor、Model 的组件实例/props/emits 差异符合 Angular、React、Vue 的包装约定。真实框架编译、渲染、SSR、并发卸载和浏览器行为仍需在 Node 26+ 环境动态复验。

## 对照结果

| API 组                     | Angular                                           | React                                  | Vue                              | 结论                                        |
| -------------------------- | ------------------------------------------------- | -------------------------------------- | -------------------------------- | ------------------------------------------- |
| `rxdb-plugin-search`       | `useSearch`、`SearchExecutionError`、4 个共享类型 | 同左                                   | 同左                             | 🟢 共享运行时值与类型一致                   |
| `rxdb-plugin-tree`         | 四个 `use*Ancestors/Descendants`                  | 同左                                   | 同左                             | 🟢 入口完整一致                             |
| `rxdb-plugin-working-tree` | `useWorkingTree`、`WorkingTreeResource`           | 同左                                   | 同左                             | 🟢 入口和资源类型一致                       |
| `rxdb-plugin-replay`       | `ReplayerComponent` + 共享恢复事件/提示           | `Replayer` + props/ref + 共享事件/提示 | `Replayer` + ref + 共享事件/提示 | 🟢 框架包装面不同但命令/事件契约一致        |
| `code-editor`              | Angular 组件实例方法 + inputs/outputs             | `CodeEditorProps` + `CodeEditorHandle` | `CodeEditorProps` + emits/expose | 🟢 命名按框架习惯，行为字段与命令面逐项对照 |
| `rxdb-model`               | Angular 组件/Directive 导出                       | React 组件/props 导出                  | Vue 组件/props 导出              | 🟢 功能分区对齐，组件命名按框架惯例         |

## 检查方法

- 逐个读取三端 `src/index.ts`，核对值导出、`export type`、共享 core 类型透传和入口命名。
- 对照同名实现和测试，检查生命周期、错误传播、资源释放、受控值同步、异步竞态和事件载荷。
- 把 Angular 的 `inject*`/组件实例、React 的 `use*`/ref、Vue 的 `use*`/expose 视为框架包装差异，不把命名差异单独误报为缺陷。
- 三端各自缺失的宿主集成测试保留在逐包报告的「风险/未覆盖」，不假设静态文件存在就等于动态通过。

## 后续验证

在 Node 26+ 环境串行运行对应三端的 `lint`、`typecheck`、`test`、`build`，再对 Code Editor/Replay/Model 执行浏览器或真实 Angular 编译器验证；若出现共享类型或事件载荷漂移，应更新对应逐包报告并提升交叉复核结论。
