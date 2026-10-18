# @aiao/rxdb-plugin-bom-vue

Vue 的 BOM 活视图、路径树与发生项编辑器。数据库必须已安装 `rxDBPluginBom` 并连接本地适配器。

```vue
<script lang="ts" setup>
import type { RxDB } from '@aiao/rxdb';
import type { BomViewInput } from '@aiao/rxdb-plugin-bom';
import { BomLineEditor, BomTree, useBomView } from '@aiao/rxdb-plugin-bom-vue';
import { watch } from 'vue';

const props = defineProps<{ db: RxDB; input: BomViewInput }>();
const { state, commands } = useBomView(props.db, props.input);
watch(
  () => props.input,
  next => commands.setInput(next)
);
</script>

<template>
  <BomTree :commands="commands" :state="state" />
  <BomLineEditor :commands="commands" :state="state" />
</template>
```

`state`类型是 `Readonly<ShallowRef<BomViewState>>`，容器只读，模板自动解包，脚本使用state.value。必须在setup或活动effectScope中调用；scope销毁时自动释放订阅与共享handle。数据库的连接与销毁由创建它的宿主管理。

输入包含 `context`、`target`、`plannedQty`、可选 `budgets` 与公式 `params`。评估日显式传入。更换上下文时调用 `commands.setInput(nextInput)`，传入完整下一份输入。Angular、React、Vue 的 `useBomView(db, input)`、`state` 业务字段和 `commands` 相同，仅状态容器分别是 signal、普通快照和 ref。

示例的watch监听完整input对象替换，修改上下文时提供新对象；也可在事件处理器中直接调用setInput。更换db时按数据库身份重新挂载组件，或停止旧effectScope后创建新作用域。

树按发生项完整路径标识节点。根默认展开，其余路径通过 `commands.toggle(path)` 独立展开；折叠支路不挂载后代。方向键、Home、End 移动焦点，Enter 选择实际发生项进入独立编辑器。后台刷新保留已有路径元素，并显示刷新状态。

备选、manual 替代、序列和批次未裁决时仍能浏览候选；截断原因和数量错误保持可见。完整数量使用 `commands.calculate()`，未裁决或被截断的结果会明确拒绝。成本与导出继续调用 BOM kernel，并遵守相同完整性边界。

`commands.loadOccurrence(id)`可读取不在已发布树中的草稿或draft ECN新发生项。编辑器保存用量、组件损耗、投料工序和生效期，十进制保持字符串，日期按UTC解释并保留毫秒。草稿头可编辑这些字段；已发布头下的draft ECN新发生项仅按协议编辑用量、损耗与工序，生效区间由ECN派生，直接改日期会被仓储拒绝。已发布既有发生项显示只读原因。发布结构的修改由调用方按既有ECN协议处理，领域错误原样保留在共享状态中。

直接调用原 `explodeBom` 仍可能取得带未解析/截断标记的部分结果，消费方须检查manifest；绑定的完整数量入口为commands.calculate。等价示例见 [Angular](../rxdb-plugin-bom-angular/README.md) 和 [React](../rxdb-plugin-bom-react/README.md)。

验证命令：`pnpm nx test rxdb-plugin-bom-vue`。
