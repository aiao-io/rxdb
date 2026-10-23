# Contract: BOM View API

**Date**: 2026-10-18。依赖 spike 和双后端回归已收敛下列合同；最终类型以 `packages/rxdb-plugin-bom/src/view-types.ts` 为准。

## 输入与入口

```ts
interface BomViewInput {
  context: ResolutionContext;
  target: ResolveTarget;
  plannedQty: PlannedQuantity;
  budgets?: ExpansionBudgets;
  params?: Record<string, string>;
}

rxdb.bom.watchView(input: BomViewInput): Observable<BomViewSnapshot>;
createBomView(db: RxDB, input: BomViewInput): BomViewHandle;
useBomView(db: RxDB, input: BomViewInput): BomViewBinding;
```

- `ResolutionContext`、`ResolveTarget`、`PlannedQuantity`、`ExpansionBudgets` 复用已有 BOM 合同；公式参数是十进制字符串。
- 数据库显式传入，不能由全局单例或最后连接的库推断。不同数据库的查询与保存必须隔离。
- 输入快照含完整业务上下文；`setInput` 替换为下一份明确输入，不能静默补当前日期、默认候选或从旧目标泄漏参数。
- `watchView` 返回派生数据 Observable；仓储使用同名查询或内部代理，具体内部方法名不成为新对外承诺。
- 三框架都导出同名 `useBomView`、`BomTree`、`BomLineEditor`。函数参数与命令名相同；仅 state 容器允许 Angular signal、Vue ref、React plain snapshot 的差异。

## 数据投影与状态

`BomViewSnapshot={expansion,explosion,quantityError,items,refreshing}` 表达下列信息：

| 信息     | 业务合同                                                                          |
| -------- | --------------------------------------------------------------------------------- |
| 节点身份 | occurrence ID 的完整路径；不能用裸 item ID 或数组序号。                           |
| 结构     | 物料/解析所得修订、层级、子节点关系，以及按路径惰性呈现所需信息。                 |
| 数量     | 来自既有数量 kernel，规范十进制字符串与单位；未解析不能表现为零或完整可消费数量。 |
| 候选     | 备选未定、manual 未选、序列/批次未定均含候选集合与未解析标记，不擅自裁决。        |
| 完整性   | 截断标记与原因、未解析信息保留到消费边界。                                        |
| 错误     | 同一共享错误合同的 `code`、`payload`、`message`；三端不自行拼业务消息。           |

绑定外观统一为 `{ state, commands }`。state 具有初始加载、空、数据与错误四种可观察状态；已有数据后台刷新时保留快照与节点，并单独表明 refreshing。判别字段为 `phase=idle/loading/empty/success/error`；数量错误单独通过 `quantityError` 保留，不把浏览空态当作完整数量可消费的证明。

切换输入后，旧请求不能覆盖新状态。相同路径的 key 在刷新中保持稳定，更新数量/文本不销毁无关 DOM。刷新失败必须可感知，旧快照不能被标为新输入的成功结果。

## 共享 Handle 与命令

`createBomView` 的 handle 管理 `state$` 与以下同组操作；精确参数与返回值以同文件的 `BomViewCommands` / `BomViewHandle` 为准：

| 操作                    | 已确认职责                                             |
| ----------------------- | ------------------------------------------------------ |
| `setInput`              | 切换完整视图输入，触发新作用域，隔离迟到结果。         |
| `refresh`               | 显式重读当前输入；自动依赖刷新仍须独立通过 AC#6～#9。  |
| `toggle(path)`          | 仅改变该完整路径的展开状态，其他相同物料路径保持独立。 |
| `loadOccurrence(id)`    | 独立读取编辑目标，不要求草稿目标先存在于已发布浏览树。 |
| `saveOccurrence(patch)` | 经共享仓储与领域校验保存允许修改的发生项。             |
| `destroy`               | 结束 handle 生命周期并释放订阅；框架卸载自动清理。     |

三个绑定使用相同命令语义。`destroy` 只在 handle 上提供，框架卸载自动调用。最后订阅释放后可重订；destroy 幂等，销毁后的订阅立即完成，后续命令明确拒绝。

## 编辑与发布边界

- 编辑字段覆盖用量、组件损耗、`operationSeq`、`effectiveFrom/effectiveTo`，数量使用十进制字符串；非法组合由共享 kernel 拒绝。
- 草稿头与 draft ECN 下的新发生项可编辑；已发布既有发生项只读。界面显示只读原因，保存端仍按真实状态校验。
- 已发布结构改量与新增仍走既有 draft ECN 写入协议，测试经 kernel 创建/发布对应 ECN；绑定和组件不自动创建 ECN、不自动替换旧发生项，不提供 ECN 管理界面。
- 路线失效导致的工序未覆盖必须点名路线与发生项，不能把它转换为无路线的成功保存或计算。
- 成环错误等业务错误在三端比较 `code/payload/message`；不比较跨运行时错误对象引用。

## 未解析与完整消费

浏览可显示部分结构、正常支路与候选。备选、manual、序列/批次未解析时，完整数量、成本及导出消费必须明确拒绝；截断也不能作为完整结构交给这些消费者。

既有 `explodeBom` 保留部分结果及 manifest 的公开行为不因本轮 UI 改变。`calculate()` 重读当前完整输入，依次验证解析完整性、数量错误、未解析候选和数量截断；不以静默零、空树或默认候选替代拒绝。

## 生命周期、缓存与依赖

- 保守依赖包含查询谓词作用域和结果引用实体，至少证明 ECN 状态、新日期、新修订、phantom 默认值与换算率的自动刷新。
- 查询输入的组织、类型、日期、备选、配置、序列、批次、目标、计划量、预算、参数都参与任务身份；同库可复用数据任务，但每份 handle 的折叠/编辑状态独立。
- 多库不串数据，卸载不留监听，重新挂载能继续得到正确结果。禁止轮询或用显式 refresh 冒充自动刷新。

## 三端 UI 合同

- `BomTree` 支持路径层级、需求量、惰性后代 DOM、独立折叠、截断和候选；刷新保留未受影响的实际元素引用。
- `BomLineEditor` 支持四字段编辑与只读原因；初始/保存加载、空目标、错误及成功状态三端一致。
- 展开、选择、表单和保存均可用键盘操作；提供焦点管理、字段标签、展开状态及可访问的错误/状态提示，满足 WCAG 2.1 AA。
- DOM 标签可因框架惯用方式不同，但可观察行为、视觉语义、公共组件名称及示例一致。

## 验收边界

AC#6～#9 真实事件与输入依赖、快照、状态、保存与生命周期已由双后端用例验证。三端浏览器、性能、覆盖率及 API baseline 是独立门禁，结果写入 quickstart；合同定稿不替代交付验收。

## 实施收敛合同（2026-10-18）

- 类型定义以 src/view-types.ts 为准；BomViewSnapshot={expansion,explosion,quantityError,items,refreshing}。items 携带实际 itemNo/description，错误以原对象保留。
- BomViewState.phase=idle/loading/empty/success/error；后台刷新保留 nodes，独立 refreshing。nodes 是按展开集合过滤的可见前序路径；初始根展开，其余支路折叠。完整路径 JSON 字符串是稳定 key。
- commands 同组三端一致：setInput/refresh/toggle/loadOccurrence/saveOccurrence/calculate；destroy 仅由 handle 暴露，框架销毁时自动执行。state$ 按订阅计数启动/释放查询，最后订阅释放后可重新订阅，destroy 后永久完成且幂等。
- calculate 取得当前完整输入的新快照，截断、备选/manual/序列/批次候选和 quantityError 均明确拒绝；保留旧 explodeBom 的部分结果行为。
- saveOccurrence 只收 BomOccurrencePatch，重新读取实际发生项与头/ECN 状态，经显式 db 的仓储保存。已发布既有发生项拒绝；draft ECN 新发生项仅允许指定的草稿编辑字段，生效区间仍来自 ECN。
- initialBomViewState、BOM_VIEW_STYLES、bomEditorFields、parseBomEditorFields、bomErrorText 为三端共用的初态、视觉和 UTC 表单/错误呈现工具，框架不重写领域校验。
