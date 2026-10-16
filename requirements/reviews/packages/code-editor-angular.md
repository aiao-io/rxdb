# Review：@aiao/code-editor-angular 评审

## 结论

🟢 未发现 P0-P2 问题。Angular 组件的 CVA、生命周期、语言竞态、a11y Compartment 与 React/Vue 语义保持一致。

## 检查范围

检查 `src/code-editor.ts` 的 `ngOnInit`、`ngOnChanges`、`writeValue`、`setDisabledState`、`setLanguage`、`setExtensions`，模板/样式、测试初始化、README；核对 `ng-package.json`、`project.json` 的 ng-packagr、typecheck 与发布 peer 依赖。

## 发现

无。`writeValue` 在组件创建前缓存并统一校验类型（`src/code-editor.ts:427-442`）；表单禁用与输入禁用取 OR（`src/code-editor.ts:160-173`）；异步语言加载用请求号丢弃过期结果（`src/code-editor.ts:492-538`）；用户扩展只重配专属 Compartment（`src/code-editor.ts:464-477`）。

## 风险/未覆盖

未覆盖 Angular 22 的真实编译器、SSR 与 Reactive Forms 浏览器行为；建议在 Node 26+ 执行 `pnpm nx test code-editor-angular`、`pnpm nx run code-editor-angular:typecheck`、`pnpm nx build code-editor-angular`。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
