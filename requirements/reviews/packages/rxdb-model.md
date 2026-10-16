# Review：@aiao/rxdb-model 评审

## 结论

🟡 发现 1 条 P2：默认字段标题生成器的缩写处理与自身文档不一致，会在查询构建器 UI 中拆散全大写缩写。其余模型、表格、编辑器、查询服务和测试未发现 P0/P1。

## 检查范围

检查 entity metadata/value 工具、form/list/table/vtable、query-builder models/services/utils 与全部 spec；核对 package/project/vite 配置、公开 index exports、README 和 VTable peer 版本。

## 发现

### P2：默认显示名把连续大写缩写拆成单字母

- 证据：`packages/rxdb-model/src/query-builder/services/schema-parser.service.ts:76-90` 的文档明确示例 `URLValue -> URL Value`，实现却对每个大写字母执行 `.replace(/([A-Z])/g, ' $1')`。输入 `URLValue` 的实际结果为 `U R L Value`（可由该纯表达式直接复现）。
- 影响：未提供 `displayNameGenerator` 时，字段名含连续缩写（URL、HTTP、UUID 等）的查询字段标题和关系标题出现额外空格，用户看到的标签与公开契约不符；若依赖标题做快照/可访问名称，也会造成跨版本抖动。
- 建议：采用连续大写 + 后续首字母边界的分词规则（例如 `([A-Z]+)([A-Z][a-z])` 与 `([a-z0-9])([A-Z])` 两步），补 `URLValue`、`HTTPServer`、`createdAt` 回归测试，并同步更新示例。
- 验证：运行 `pnpm nx test rxdb-model` 并检查生成字段的 `displayName`；若需要单测筛选，先用 `pnpm nx test rxdb-model --help` 核对当前 runner 的参数。

## 风险/未覆盖

VTable 的真实 DOM/Canvas 渲染、浏览器剪贴板、Angular/React/Vue 组件集成未在本包静态环境复现；模型测试本身覆盖较广。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
