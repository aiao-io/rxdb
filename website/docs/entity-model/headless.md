# Headless 实体能力

Headless 入口只提供状态、动作和事件，不创建 DOM，也不引入 Tailwind、daisyUI 或 VTable。消费方负责字段控件、布局、样式以及自定义控件的键盘和焦点语义；默认 `EntityForm`、`EntityList` 等组件继续提供开箱即用的展示。

## 框架无关表单状态

从 `@aiao/rxdb-model/headless`（或根入口）导入 `createEntityFormController`。它在浏览器和 Node 中都可运行：

```ts
import { createEntityFormController } from '@aiao/rxdb-model/headless';

const form = createEntityFormController({
  fields,
  data: { title: '初始值', count: 0 },
  mode: 'edit'
});

const stop = form.subscribe((snapshot, event) => {
  render(snapshot); // 消费方决定 DOM 和控件
  log(event);
});

form.setField('title', inputValue);
const result = form.submit();
if (result.valid) await save(result.data, result.changes);

form.cancel();
stop();
form.dispose();
```

`snapshot` 提供 `fields`、`data`、`initialData`、`errors`、`valid`、`dirty`、`mode` 和 `readonly`。`setField` 先按字段类型严格解析；解析失败时返回字段定位错误并保留最近一次合法值。`validate` 只校验，`submit` 只在合法时返回数据和变更集，`setData` / `setEntity` 会清掉旧错误和输入残留，`cancel` 恢复最近一次宿主输入。`view` 模式的字段和提交动作是只读的。卸载时必须调用 `dispose`，避免订阅继续收到事件。

## React

```tsx
import { useEntityForm } from '@aiao/rxdb-model-react/headless';

function Form({ fields, data }: Props): React.JSX.Element {
  const { controller, snapshot } = useEntityForm({ fields, data, mode: 'edit' });
  return (
    <input
      value={String(snapshot.data.title ?? '')}
      onChange={event => controller.setField('title', event.target.value)}
    />
  );
}
```

`useEntityForm` 使用 React 的外部订阅模型，并在组件卸载时释放控制器。`useEntityFormHeadless` 是同一 API 的别名。`data`、`entity`、`fields` 和 `mode` 更新时，宿主应传入新引用以触发对应状态同步。

## Angular 与 Vue

Angular 和 Vue 绑定复用同一个 `EntityFormController`，只负责把快照接到各自的 signal / ref 生命周期。Angular 从 `@aiao/rxdb-model-angular/headless` 导入 `injectEntityForm`、`injectQueryBuilder`、`injectEntityList`、`injectEntityDetail`、`injectEntityDialog` 和 `injectQueryTable`；Vue 从 `@aiao/rxdb-model-vue/headless` 导入同名 `use*` composable。每个绑定都返回 `{ controller, snapshot }`，并在宿主销毁时释放订阅。三端共享字段解析、校验、只读和取消语义；框架层只处理响应性和销毁。

```ts
// Angular（在组件的注入上下文中）
const angularForm = injectEntityForm({ fields, data, mode: 'edit' });
angularForm.controller.setField('title', value);
const angularTitle = angularForm.snapshot().data['title'];

// Vue <script setup>
const vueForm = useEntityForm({ fields, data, mode: 'edit' });
vueForm.controller.setField('title', value);
const vueTitle = vueForm.snapshot.value.data['title'];
```

## 依赖边界

只使用 headless 核心或框架绑定时，不需要安装 `@visactor/vtable`。需要 `EntityTable` / `QueryTable` 或 VTable 列工具时，再安装对应的可选 peer 并使用默认组件入口。默认组件的 CSS 与无障碍交互仍由消费方按[样式接入](styling.md)接线。

## 渐进迁移

可以先保留默认 `EntityForm`，把 `onFieldChanged`、`onFormSubmitted` 和 `onValidationErrors` 的处理迁移到控制器；确认自定义控件的标签、错误关联、禁用状态、键盘和焦点行为后，再替换展示层。列表、详情和查询构建器同样沿用共享状态与动作，默认组件和 headless 消费方可以在同一页面并存。
