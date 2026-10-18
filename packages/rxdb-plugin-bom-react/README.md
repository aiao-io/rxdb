# @aiao/rxdb-plugin-bom-react

React 的 BOM 展开树与发生项编辑器。数量、解析、候选、刷新依赖和保存规则共用 `@aiao/rxdb-plugin-bom`，绑定层只管理 React 订阅。

```tsx
import type { RxDB } from '@aiao/rxdb';
import type { BomViewInput } from '@aiao/rxdb-plugin-bom';
import { BomLineEditor, BomTree, useBomView } from '@aiao/rxdb-plugin-bom-react';

function BomView({ db, input }: { db: RxDB; input: BomViewInput }) {
  const { state, commands } = useBomView(db, input);
  return (
    <>
      <BomTree state={state} commands={commands} />
      <BomLineEditor state={state} commands={commands} />
    </>
  );
}
```

`db` 必须是显式传入、已安装BOM插件并连接本地适配器的数据库；同一数据库可创建多份独立绑定。`input`包含context、target、plannedQty，可带budgets与params，评估日显式传入。

三个框架均导出 `useBomView`、`BomTree`、`BomLineEditor` 与 `BomViewBinding`。React的state是普通快照；Angular使用Signal，Vue使用只读ShallowRef容器。命令同名同义：setInput、refresh、toggle、loadOccurrence、saveOccurrence、calculate。Hook按完整input内容同步当前控制器，db变化时通过useLayoutEffect清理并创建控制器；卸载释放订阅和handle，StrictMode重挂创建新的控制器。数据库的连接与销毁由创建它的宿主管理。

树按发生项路径保持节点身份，根默认展开，子树按需呈现。后台刷新保留已有 DOM；方向键、Home/End、Enter 与空格支持焦点、编辑和展开操作。候选与截断结果可以浏览，完整数量计算遇到未解析或截断会明确拒绝，不自动选择候选。

`commands.loadOccurrence(id)`可独立加载不在已发布树中的草稿或draft ECN新发生项。编辑器提供用量、组件损耗、投料工序、生效起点和生效终点。日期输入按UTC解释并保留毫秒；十进制保持字符串。草稿头可编辑这些字段；已发布头下的draft ECN新发生项仅按协议编辑用量、损耗与工序，生效区间由ECN派生，直接改日期会被仓储拒绝。已发布既有发生项显示只读原因。保存错误保留原始message、code与payload，ECN创建和发布由调用方处理。

完整数量通过 `commands.calculate()` 重读并校验。原 `explodeBom` 仍可能返回带未解析/截断标记的部分结果；成本卷算和导出继续调用核心API并遵守完整性校验。等价示例见 [Angular](../rxdb-plugin-bom-angular/README.md) 和 [Vue](../rxdb-plugin-bom-vue/README.md)。
