# @aiao/rxdb-plugin-bom-angular

Angular 的 BOM signal 绑定与可复用 `BomTree`、`BomLineEditor`。领域查询、路径折叠、数量计算、候选投影、完整性校验和保存规则由 `@aiao/rxdb-plugin-bom` 的共享控制器处理。

```ts
import type { RxDB } from '@aiao/rxdb';
import { BomLineEditor, BomTree, useBomView, type BomViewInput } from '@aiao/rxdb-plugin-bom-angular';
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-bom-page',
  imports: [BomTree, BomLineEditor],
  template: `
    <ao-bom-tree [commands]="view.commands" [state]="view.state()" />
    <ao-bom-line-editor [commands]="view.commands" [state]="view.state()" />
  `
})
export class BomPage {
  readonly db = input.required<RxDB>();
  readonly query = input.required<BomViewInput>();
  readonly view = useBomView(this.db, this.query);
}
```

`db` 是已安装 BOM 插件并完成连接的显式数据库；`query` 是完整输入（context、target、plannedQty，可带 budgets 与 params），评估日显式传入。两个参数都接受普通值或 `Signal`。`useBomView` 必须在 Angular 注入上下文调用；状态是只读 `Signal<BomViewState>`，`DestroyRef` 自动取消订阅并销毁共享 handle。

输入按内容身份跟踪：signal 换成内容不同的输入时自动 `setInput`，内容相同的新对象不会重载；`db` 换成另一个实例时销毁旧控制器并以当前输入新建，旧流的迟到值不会写入状态。这与 React、Vue 的 `useBomView` 同一语义。控制器在宿主首次变更检测时创建，此前与销毁之后调用命令会明确抛错。数据库的连接与销毁由创建它的宿主管理。

三端均返回 `{ state, commands }`，同名命令为 `setInput`、`refresh`、`toggle`、`loadOccurrence`、`saveOccurrence`、`calculate`。Angular 读取 `state()`，React 读取普通快照，Vue 读取 `state.value`。`BomViewInput`、`BomViewState`、`BomViewCommands` 随绑定包转出，无需再从核心包导入。直接调用 `commands.setInput(nextInput)` 同样可以替换完整输入，旧请求不会覆盖新输入。

树按完整发生项路径保持身份，仅渲染共享状态提供的可见前序。键盘遵循 WAI-ARIA tree 模式：方向键和 Home/End 移动焦点（ArrowLeft 没有父节点时不动），Space 切换展开，Enter 加载当前行；当前焦点节点不可见时首行是 Tab 入口。加载、空、数据、错误与后台刷新均有可见状态；刷新保留已有节点。

`commands.loadOccurrence(id)` 可独立加载不在已发布浏览树中的草稿或draft ECN新发生项。编辑器使用原生中文标签和UTC `datetime-local`字段（表单内注明并经 `aria-describedby` 关联“生效期按 UTC 填写与显示”），保留毫秒，支持用量、组件损耗、投料工序、生效起点和终点。草稿头可编辑这些字段；已发布头下的draft ECN新发生项仅按协议编辑用量、损耗与工序，生效区间由ECN派生，直接改日期会被仓储拒绝。已发布既有发生项显示只读原因。保存沿用共享仓储，ECN创建和发布由调用方处理，领域错误的code/payload/message按原契约展示。

备选、manual、序列或批次未决以及预算截断均可浏览，`calculate()` 会明确拒绝不完整结果。成本和导出同样遵守完整消费边界；前端不选择默认候选，不重写数量公式。

完整数量通过 `commands.calculate()` 重读并校验。直接调用原 `explodeBom` 仍可能取得带未解析/截断标记的部分结果，消费方须检查manifest。等价示例见 [React](../rxdb-plugin-bom-react/README.md) 和 [Vue](../rxdb-plugin-bom-vue/README.md)。
