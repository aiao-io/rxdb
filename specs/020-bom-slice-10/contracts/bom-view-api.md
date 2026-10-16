# Contract Draft: BOM View API

**Date**: 2026-10-17。已确认的入口和输入如下；快照节点、编辑 patch 和生命周期细项由主会话依赖 spike 收敛后补全。本文不是声称已发布的新 API，也不预先引入新引擎注册 API。

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

`BomViewSnapshot` 必须能表达下列信息；字段组织与完整类型由 spike 确定：

| 信息     | 业务合同                                                                          |
| -------- | --------------------------------------------------------------------------------- |
| 节点身份 | occurrence ID 的完整路径；不能用裸 item ID 或数组序号。                           |
| 结构     | 物料/解析所得修订、层级、子节点关系，以及按路径惰性呈现所需信息。                 |
| 数量     | 来自既有数量 kernel，规范十进制字符串与单位；未解析不能表现为零或完整可消费数量。 |
| 候选     | 备选未定、manual 未选、序列/批次未定均含候选集合与未解析标记，不擅自裁决。        |
| 完整性   | 截断标记与原因、未解析信息保留到消费边界。                                        |
| 错误     | 同一共享错误合同的 `code`、`payload`、`message`；三端不自行拼业务消息。           |

绑定外观统一为 `{ state, commands }`。state 具有初始加载、空、数据与错误四种可观察状态；已有数据后台刷新时保留快照与节点，并单独表明 refreshing。具体判别字段名在 spike 后冻结。

切换输入后，旧请求不能覆盖新状态。相同路径的 key 在刷新中保持稳定，更新数量/文本不销毁无关 DOM。刷新失败必须可感知，旧快照不能被标为新输入的成功结果。

## 共享 Handle 与命令

`createBomView` 的 handle 管理 `state$` 与以下同组操作；精确参数细项/返回值待 spike，不在文档阶段发明额外 handle：

| 操作                    | 已确认职责                                             |
| ----------------------- | ------------------------------------------------------ |
| `setInput`              | 切换完整视图输入，触发新作用域，隔离迟到结果。         |
| `refresh`               | 显式重读当前输入；自动依赖刷新仍须独立通过 AC#6～#9。  |
| `toggle(path)`          | 仅改变该完整路径的展开状态，其他相同物料路径保持独立。 |
| `loadOccurrence(id)`    | 独立读取编辑目标，不要求草稿目标先存在于已发布浏览树。 |
| `saveOccurrence(patch)` | 经共享仓储与领域校验保存允许修改的发生项。             |
| `destroy`               | 结束 handle 生命周期并释放订阅；框架卸载自动清理。     |

三个绑定使用相同命令语义。`destroy` 是否作为可见 commands 成员，以及初始化/销毁幂等与复用细项，由 spike 一次收敛，不能三端各定规则。

## 编辑与发布边界

- 编辑字段覆盖用量、组件损耗、`operationSeq`、`effectiveFrom/effectiveTo`，数量使用十进制字符串；非法组合由共享 kernel 拒绝。
- 草稿头与 draft ECN 下的新发生项可编辑；已发布既有发生项只读。界面显示只读原因，保存端仍按真实状态校验。
- 已发布结构改量与新增仍走既有 draft ECN 写入协议，测试经 kernel 创建/发布对应 ECN；绑定和组件不自动创建 ECN、不自动替换旧发生项，不提供 ECN 管理界面。
- 路线失效导致的工序未覆盖必须点名路线与发生项，不能把它转换为无路线的成功保存或计算。
- 成环错误等业务错误在三端比较 `code/payload/message`；不比较跨运行时错误对象引用。

## 未解析与完整消费

浏览可显示部分结构、正常支路与候选。备选、manual、序列/批次未解析时，完整数量、成本及导出消费必须明确拒绝；截断也不能作为完整结构交给这些消费者。

既有 `explodeBom` 保留部分结果及 manifest 的公开行为不因本轮 UI 改变。新视图中“可浏览”与“可完整消费”的区分，以及复用既有完整性检查的具体数量入口，由主会话 spike 明确并加入共享测试；不以静默零、空树或默认候选替代拒绝。

## 生命周期、缓存与依赖

- 保守依赖包含查询谓词作用域和结果引用实体，至少证明 ECN 状态、新日期、新修订、phantom 默认值与换算率的自动刷新。
- 查询输入的组织、类型、日期、备选、配置、序列、批次、目标、计划量、预算、参数都参与任务身份；同库可复用数据任务，但每份 handle 的折叠/编辑状态独立。
- 多库不串数据，卸载不留监听，重新挂载能继续得到正确结果。禁止轮询或用显式 refresh 冒充自动刷新。

## 三端 UI 合同

- `BomTree` 支持路径层级、需求量、惰性后代 DOM、独立折叠、截断和候选；刷新保留未受影响的实际元素引用。
- `BomLineEditor` 支持四字段编辑与只读原因；初始/保存加载、空目标、错误及成功状态三端一致。
- 展开、选择、表单和保存均可用键盘操作；提供焦点管理、字段标签、展开状态及可访问的错误/状态提示，满足 WCAG 2.1 AA。
- DOM 标签可因框架惯用方式不同，但可观察行为、视觉语义、公共组件名称及示例一致。

## 定稿门槛

主会话先运行 AC#6～#9 的真实依赖 spike，再补齐节点投影、state 判别字段、保存 patch 与生命周期细项。届时一并冻结三端类型测试与 API baseline；当前不把尚未验证的细节写成已交付合同。
