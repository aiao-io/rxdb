# Review：@aiao/rxdb-model-angular 评审

## 结论

🟡 二次评审发现 1 条 P2：独立使用且命名空间/名称无法解析时，`metadataValue`/`formFieldsValue` 的非空断言在变更检测期抛 TypeError；首轮「未发现 P0-P2」结论被推翻。

## 检查范围

检查 `src/entity-*`、`src/query-builder`、模板、测试替身及 `src/index.ts`；核对 ng-package、tailwind 导出、peerDependencies 与 `project.json` 的 Angular build/typecheck 配置。二次评审按「独立使用（无 CDK dialog data）」语境逐组件对照三端。

## 发现

### P2：`metadataValue`/`formFieldsValue` 回退链以 `#dialogData!` 收尾，独立使用 + 解析失败时模板抛 TypeError

- 证据：`src/entity-detail/entity-detail.ts:240-242` `get metadataValue(): EntityMetadata { return this.metadata() ?? this.#metadataFromRouteInputs() ?? this.#dialogData!.metadata; }`；`245` 行的 `formFieldsValue` 同款 `this.#dialogData!.formFields`。独立使用（无 CDK dialog）且 namespace/name 无法解析（路由参数笔误、实体未注册、未配 RxDB provider）时，`#dialogData` 为 null，非空断言在模板 `[title]="dialogTitle()"`（`entity-detail.html:1`）的变更检测期抛 TypeError。
- 触发：上述配置下宿主页面在变更检测时崩溃；React（`entity-detail.tsx:188` 回退 undefined）与 Vue（`EntityDetail.vue:239-241`）在同样配置下降级为空标题/空 tabs 而非崩溃。
- 建议：`#dialogData` 为 null 时回退 `undefined`/`[]`（或让两个 getter 声明可空），与另两端语义对齐。

## 风险/未覆盖

未覆盖 Angular compiler 的真实模板诊断、CDK overlay、VTable 真实版本和移动端触摸拖放；建议 Node 26+ 执行 build/typecheck/test 与浏览器 e2e。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
