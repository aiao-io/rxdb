# Headless 实体能力

Headless 入口提供状态、动作和事件，不创建 DOM，也不引入 Tailwind、daisyUI 或 VTable。消费方负责字段控件、布局、样式、键盘和焦点语义。默认组件入口继续可用；本故事仍在实现，默认 QueryBuilder、列表和详情尚未全部迁移到新控制器。

## 框架无关表单状态

从 `@aiao/rxdb-model/headless` 导入 `createEntityFormController`。需要隔离展示依赖时使用这个子路径；根入口同时导出默认表格设施。

```ts
import { createEntityFormController } from '@aiao/rxdb-model/headless';

const form = createEntityFormController({ fields, data: { title: '初始值', count: 0 }, mode: 'edit' });
const stop = form.subscribe((snapshot, event) => {
  render(snapshot);
  log(event);
});

form.setField('title', inputValue);
const result = form.submit();
if (result.valid) await save(result.data, result.changes);
form.cancel();
stop();
form.dispose();
```

`snapshot` 提供 `fieldStates`、`fields`、`data`、`initialData`、`errors`、`valid`、`dirty`、`mode` 和 `readonly`。`fieldStates` 包含每个字段的配置、值、展示文本、错误和只读状态。快照中的结构化表单值与内部状态隔离。

`setField` 先严格解析，失败时保留最近合法值并暴露字段错误；错误修复前不能提交。`setData` / `setEntity` 将宿主输入设为新基线并清除旧错误；`cancel` 恢复最近基线。`view` 模式阻止编辑和提交。核心实例由消费方调用 `dispose()` 释放。

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

各 `use*` hook 返回 `{ controller, snapshot }`，并自动管理订阅与销毁。外部快照缓存保持 React 所需的稳定引用；StrictMode 的 effect 清理与重连不会提前销毁当前控制器。真正卸载后会在微任务中释放。表单与详情的字段、模式、关系候选更新保留本地草稿；内容实际变化的 `data` / `entity` 才重置输入。

## Angular

```ts
import { signal } from '@angular/core';
import { injectEntityForm, injectEntityList } from '@aiao/rxdb-model-angular/headless';

const source = signal({ fields, data, mode: 'edit' as const });
const form = injectEntityForm(source);
const list = injectEntityList(() => ({ query: activeQuery(), load }));
const title = form.snapshot().data['title'];
```

在注入上下文调用 `injectEntityForm`、`injectQueryBuilder`、`injectEntityList`、`injectEntityDetail`、`injectEntityDialog` 或 `injectQueryTable`。输入可以是普通对象、signal 或返回选项的 getter；需要跟随 signal 更新时传 signal/getter。返回的 `snapshot()` 是只读 signal，`DestroyRef` 销毁时自动清理。表单/详情输入按内容比较，其他配置更新不覆盖未提交草稿。

## Vue

```ts
import { reactive } from 'vue';
import { useEntityForm } from '@aiao/rxdb-model-vue/headless';

const options = reactive({ fields, data, mode: 'edit' as const });
const form = useEntityForm(options);
const title = form.snapshot.value.data['title'];
```

Vue 的同名 `use*` composable 返回 `{ controller, snapshot }`，`snapshot` 是 ref。传入响应式选项以跟随输入变化；组件卸载时清理订阅与控制器。

## 查询、列表与详情动作

`createQueryBuilderController` 复用已有 `QueryBuilderService` 的分组、规则、校验和查询转换。`setFields` 更新字段元数据；规则操作通过 `addRule`、`addGroup`、`updateRule`、`updateGroupCombinator`、`moveItem`、`remove` 和 `clear` 完成。

列表和 QueryTable 的 `load` 接收 `{ query, sorts, page, pageSize, signal }`，返回 `{ records, total? }`。`setQuery`、`setSorts`、`setPage` 会使旧查询失效并清掉旧页；调用 `refresh()` 执行当前请求。刷新同一页时保留已有记录，失败通过 `snapshot.error` 暴露。过期结果不会回写，数据源应将 `signal` 传入自己的可取消请求。

`create`、`update`、`remove` 使用消费方提供的写入回调，沿用传入的 `capabilities`。同一实体的更新按调用顺序执行；有数据源时写入成功后重新查询。批量 `remove` 可能部分成功：成功项先从当前记录和选择中移除，失败原因以 `AggregateError.errors` 抛出，消费方应按实际结果提示并决定是否刷新。当前 headless 控制器尚未接入默认列表的撤销/重做和手动排序动作。

详情 `save(onSave)` 只把合法草稿交给持久化回调；创建实例和关系装配由消费方完成。重复保存会拒绝；保存期间切换输入、取消或关闭后，迟到成功结果不会覆盖新草稿或重新关闭新会话。保存失败通过 rejected Promise 和 `snapshot.error` 暴露。`cancel()` 重置草稿，`close()` 关闭状态；自己的弹窗应连接这两个动作及结果处理。

## 依赖和交互责任

四个公开包的 `/headless` 是独立构建入口，VTable 为可选 peer。默认 `EntityTable` / `QueryTable` 渲染或 VTable 列工具仍需安装表格 peer。`pnpm verify:headless-consumer` 检查构建产物入口及拒绝 VTable 的运行时导入；它复用工作区第三方依赖，不能替代尚待完成的仓外 tarball 安装与三框架完整 UI 示例。

消费方须连接原生标签或 `aria-label`、输入与错误的 `aria-describedby`、只读/禁用状态、提交/取消键盘行为，以及自定义弹窗的初始焦点、焦点约束和关闭后焦点恢复。默认组件的样式接线见[样式接入](styling.md)。

## 渐进迁移

先选择一个表单使用自定义控件，将事件处理连接到共享控制器；确认标签、错误关联、键盘和焦点行为后再扩展到查询、列表和详情。同页可并存默认组件与 headless 消费方。默认展示复用、列表历史/手动排序和独立消费闭环仍按 US-403 验收，不应据现有 API 提前宣称全部完成。
