# Review：@aiao/rxdb-model 评审

## 结论

🟡 首轮 P2 已修复并经二次评审复核；二次评审确认 1 条残留 P3（缩写分词对「缩写 + 数字 + 大写」形态的边界）。

## 检查范围

检查 entity metadata/value 工具、form/list/table/vtable、query-builder models/services/utils 与全部 spec；核对 package/project/vite 配置、公开 index exports、README 和 VTable peer 版本。

## 发现

### P2（已修复，二次评审复核）：默认显示名把连续大写缩写拆成单字母

- 修复：`src/query-builder/services/schema-parser.service.ts:86-90` 改为两步分词 `([A-Z]+)([A-Z][a-z])` + `([a-z\d])([A-Z])`。文档示例 `URLValue → URL Value`、`IDCard → ID Card`、`createdAt → Created At`、纯缩写 `ABC` 均与文档一致（二次评审已执行验证）。回归：`schema-parser.service.spec.ts` 补缩写用例；Node 26.7 下本包全量测试 **996/996 通过**。原条目证据与影响见首轮记录（`git show 17368950:requirements/reviews/packages/rxdb-model.md`）。

### P3（二次评审新确认）：缩写分词对「缩写 + 数字 + 大写」形态仍有边界

- 证据：`schema-parser.service.ts:88-89` 的两步正则对 `IPv4Address` 得到 `I Pv4 Address`（第一步贪婪 `[A-Z]+` 从 `IP` 回退到 `I`+`Pv`）、对 `2FAuth` 得到 `2 F Auth`（第二步按 `[a-z\d])([A-Z]` 切开了前置 token 内的数字-大写边界），均已执行复现。
- 影响：仅影响含此类形态的字段名标题（可感知的标签瑕疵），不涉及数据正确性。
- 建议：数字-大写边界只在后随小写时才切（`([a-z\d])([A-Z](?=[a-z]))`），或对数字嵌入 token 做预处理。

## 风险/未覆盖

VTable 的真实 DOM/Canvas 渲染、浏览器剪贴板、Angular/React/Vue 组件集成未在本包静态环境复现；模型测试本身覆盖较广。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
