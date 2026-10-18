# @aiao/rxdb-plugin-bom-angular

Angular 的 BOM signal 绑定与可复用 `BomTree`、`BomLineEditor`。领域查询、路径折叠、数量计算、候选投影、完整性校验和保存规则由 `@aiao/rxdb-plugin-bom` 的共享控制器处理。

```ts
import { BomLineEditor, BomTree, useBomView } from '@aiao/rxdb-plugin-bom-angular';
import { Component } from '@angular/core';

@Component({
  standalone: true,
  imports: [BomTree, BomLineEditor],
  template: `
    <ao-bom-tree [commands]="view.commands" [state]="view.state()" />
    <ao-bom-line-editor [commands]="view.commands" [state]="view.state()" />
  `
})
export class BomPage {
  readonly view = useBomView(db, {
    context: { bomType: 'ebom', orgId: 'factory', asOfDate: new Date('2099-01-01T00:00:00Z') },
    target: { parentItemId: rootId },
    plannedQty: { value: '1', uom: 'pcs' }
  });
}
```

`db` 是已安装 BOM 插件并完成连接的显式数据库，`rootId` 是目标物料。`useBomView` 必须在 Angular 注入上下文调用；状态是只读 `Signal<BomViewState>`，`DestroyRef` 自动取消订阅并销毁共享 handle。

数据库的连接与销毁由创建它的宿主管理。更换数据库时重建组件或绑定所在的注入作用域。

三端均返回 `{ state, commands }`，同名命令为 `setInput`、`refresh`、`toggle`、`loadOccurrence`、`saveOccurrence`、`calculate`。Angular 读取 `state()`，React 读取普通快照，Vue 读取 `state.value`。通过 `commands.setInput(nextInput)` 替换完整输入，旧请求不会覆盖新输入。

树按完整发生项路径保持身份，仅渲染共享状态提供的可见前序。方向键和 Home/End 移动焦点，Space 切换展开，Enter 加载当前行。加载、空、数据、错误与后台刷新均有可见状态；刷新保留已有节点。

`commands.loadOccurrence(id)` 可独立加载不在已发布浏览树中的草稿或draft ECN新发生项。编辑器使用原生中文标签和UTC `datetime-local`字段，保留毫秒，支持用量、组件损耗、投料工序、生效起点和终点。草稿头可编辑这些字段；已发布头下的draft ECN新发生项仅按协议编辑用量、损耗与工序，生效区间由ECN派生，直接改日期会被仓储拒绝。已发布既有发生项显示只读原因。保存沿用共享仓储，ECN创建和发布由调用方处理，领域错误的code/payload/message按原契约展示。

备选、manual、序列或批次未决以及预算截断均可浏览，`calculate()` 会明确拒绝不完整结果。成本和导出同样遵守完整消费边界；前端不选择默认候选，不重写数量公式。

完整数量通过 `commands.calculate()` 重读并校验。直接调用原 `explodeBom` 仍可能取得带未解析/截断标记的部分结果，消费方须检查manifest。等价示例见 [React](../rxdb-plugin-bom-react/README.md) 和 [Vue](../rxdb-plugin-bom-vue/README.md)。
