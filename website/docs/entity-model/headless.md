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

`setField` 先严格解析，失败时保留最近合法值并暴露字段错误；该错误保留到同字段输入合法值、`cancel()` 或宿主重置，期间 `validate()` 与 `submit()` 都拒绝。控件若在解析失败后回显最近合法值（如受控输入绑定 `snapshot.data`），调用 `discardInput(field)` 丢弃这次输入，提交改按最近合法值校验；默认表单即按此保持原有提交语义。`setData` / `setEntity` 将宿主输入设为新基线并清除旧错误；`cancel` 恢复最近基线。`view` 模式阻止编辑和提交。核心实例由消费方调用 `dispose()` 释放。

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

各 `use*` hook 返回 `{ controller, snapshot }`，订阅随 effect 建立与清理，外部快照缓存保持 React 所需的稳定引用。控制器保存在组件 state 中，hook 不调用 `dispose()`：StrictMode 回放、`<Activity>` 隐藏与 Fast Refresh 都会清理并重建 effects、保留 state，与真正卸载无从区分。重显后同一控制器的草稿与动作照常可用；卸载后控制器随组件回收，进行中的列表查询不会被中止，迟到结果只写入已脱离的控制器。表单与详情的字段、模式、关系候选更新保留本地草稿；内容实际变化的 `data` / `entity` 才重置输入。

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

列表和 QueryTable 的 `load` 接收 `{ query, sorts, page, pageSize, signal }`，返回 `{ records, total? }`。`setQuery`、`setSorts`、`setPage` 会使旧查询失效并清掉旧页，与当前值相同时不做任何事；调用 `refresh()` 执行当前请求。刷新同一页时保留已有记录，失败通过 `snapshot.error` 暴露。过期结果不会回写，数据源应将 `signal` 传入自己的可取消请求。

三框架绑定把 `query`、`sorts`、`page`、`pageSize`、`records` 和 `capabilities` 视为可随宿主更新的输入，经 `syncInput()` 只转发相对上一次输入真正变化的项，并按查询、排序、分页、记录、能力的次序应用：同批传入的新页记录不会被随后的翻页清掉，重传等值输入也不会中止进行中的查询。控制器保存查询、排序与能力的副本，宿主原地修改这些对象后再同步同样能识别变化。`load` 与写入回调只在创建时读取。

`create`、`update`、`remove` 使用消费方提供的写入回调，沿用传入的 `capabilities`。同一实体的更新按调用顺序执行；有数据源时写入成功后重新查询。写入开始会中止进行中的查询，公开 `loading` 随即回到 false；写入失败只以 rejected Promise 报告，不写入 `snapshot.error`，也不自动重新查询，需要时由消费方调用 `setError()` 或 `refresh()`。批量 `remove` 可能部分成功：成功项先从当前记录和选择中移除，失败原因以 `AggregateError.errors` 抛出，消费方应按实际结果提示并决定是否刷新。当前 headless 控制器尚未接入默认列表的撤销/重做和手动排序动作。

详情 `save(onSave)` 只把合法草稿交给持久化回调；创建实例和关系装配由消费方完成。重复保存会拒绝；保存期间切换输入、继续编辑、取消或关闭后，迟到的成功不会覆盖新草稿或重新关闭新会话，迟到的失败只拒绝原 Promise，不写入新会话的 `snapshot.error`。当前会话的保存失败通过 rejected Promise 和 `snapshot.error` 暴露。`cancel()` 重置草稿，`close()` 关闭状态；自己的弹窗应连接这两个动作及结果处理。

## 接入真实应用

三个演示应用各有一个只经 headless 入口驱动的示例页 `/headless`（`apps/dev-rxdb-{angular,react,vue}/` 的 `pages/headless/`）：表单、筛选、列表、详情与弹窗的 DOM、控件和样式都是页面自己的，不渲染默认组件。`apps/dev-rxdb-*-e2e/src/headless-entity.spec.ts` 是三端同一份用例，在生产构建上跑。下面是接入时需要留意的点。

### 查询构建器的字段、操作符与输入类型

字段、操作符和输入类型都从 `/headless` 取，不必为此引入根入口：

```ts
import { createSchemaFromEntity, getDefaultOperatorRegistry, getInputType, modelText } from '@aiao/rxdb-model/headless';

const fields = createSchemaFromEntity(getEntityMetadata(Article), {
  fieldFilter: field => ['title', 'viewCount'].includes(field.name)
});
const operators = getDefaultOperatorRegistry().getForField(fields[0]);
const kind = getInputType(field.type, rule.operator, field.enum); // 'string' | 'number' | 'enum' | 'none' …
```

规则的 `value` 按控件传入的值原样记录，数值字段请把输入框文本转成 number 再写入。能力约束同样来自这里的 `deriveEntityCapabilities(metadata, { readOnly })`，传给列表的 `capabilities`。

### 新建表单的基线

默认组件创建实体时先用 `entityManager.instantiate(Entity)` 建草稿，保留实体构造函数里的默认值。控制器缺省的基线 `createDefaultFormData` 把未填字段置 `null`，整份 `data` 拿去建实体会覆盖这些默认值；遇到带默认值且 NOT NULL 的列（示例里 `Article.viewCount`）写入直接失败。新建时用实例化的草稿作基线：

```ts
const blank = entityToFormData(rxdb.entityManager.instantiate(Article), fields);
const form = createEntityFormController({ fields, data: blank, mode: 'create' });
```

也可以只持久化 `submit()` 返回的 `changes`：没改过的字段不在其中。

### 国际化

控制器不会自动读取应用的翻译运行时：表单、详情和查询构建器的 `i18n` 选项缺省时用内置中文。把应用的运行时传进去（各框架 `@aiao/rxdb-i18n-{react,vue,angular}` 的 `useI18nRuntime()`），校验文案才跟随应用语言；内置操作符的展示文案用 `modelText(operator.labelKey, undefined, i18n)` 翻译。随包目录只带中文，要显示英文需在应用的运行时里注册英文目录，两个目录都从 `/headless` 取：

```ts
import { modelEnMessages, modelMessages } from '@aiao/rxdb-model/headless';

const catalogs = [...modelMessages, { locale: 'en', namespace: 'rxdb-model', messages: modelEnMessages }];
```

运行时带 `changes$`（应用的 `I18n` 就有）时，控制器会在语言或目录变化后用新语言重建已显示的校验文案，不必自己触发：表单与查询构建器重新发出 `validationChanged`（详情经 `formChanged` 转发），数据、输入和查询输出都不变；没有错误可刷新时不重建也不通知。重新校验不改草稿，所以详情进行中的保存不受影响。订阅只弱引用控制器：宿主不调用 `dispose()`（如 React 绑定，卸载后随组件回收）时，控制器被回收后订阅随之清理。

字段配置里的显示名由你构建（例如 `buildFormFields(metadata, mode, i18n)` 的系统字段名），语言变化后用 `setFields` 重建。`setFields` 会发出 `reset`，但保留同类型字段尚未修正的解析失败；自己保存输入文本的控件，不要在 `reset` 时无条件清空仍有解析错误的字段。

### 列表何时取数

列表控制器不会自己取数：查询、排序、分页变化只会清掉旧页，之后要调用 `refresh()`。快照里的 `sorts` 每次发布都是新数组，不能直接当依赖，用序列化后的请求键触发：

```ts
const key = JSON.stringify([snapshot.query, snapshot.sorts, snapshot.page, snapshot.pageSize]);
useEffect(() => {
  void controller.refresh().catch(() => undefined); // 失败已写入 snapshot.error
}, [controller, key]);
```

### 各框架的注意事项

- **Angular**：signal 输入在组件实例化后才可读取，而 `injectEntity*` 在注入上下文里立即读取选项。选项依赖输入时，先用占位选项创建，再由 effect 写入真实选项（默认表单组件也是这样做的）。
- **三个框架通用**：详情的 `tabs` 与 `activeTab` 只在创建时读取，绑定不会同步后续变化；Tab 随模式变化时，保持 `tabs` 不变，在自己的模板里隐藏不需要的 Tab。
- **Vue**：`useEntity*` 返回的 `controller` 不能放进 `reactive` / `ref`，ES 私有字段会报 `Cannot read private member`，直接使用返回值即可。
- **自有弹窗的焦点**：`<dialog>.showModal()` 提供焦点约束，但弹窗随组件卸载后浏览器不会把焦点还给打开它的元素；打开前记下 `document.activeElement`，关闭时自己 `focus()`。

## 依赖和交互责任

四个公开包的 `/headless` 是独立构建入口，VTable 为可选 peer。默认 `EntityTable` / `QueryTable` 渲染或 VTable 列工具仍需安装表格 peer。`pnpm verify:headless-consumer` 检查构建产物入口及拒绝 VTable 的运行时导入；它复用工作区第三方依赖，不能替代尚待完成的仓外 tarball 安装与三框架完整 UI 示例。

消费方须连接原生标签或 `aria-label`、输入与错误的 `aria-describedby`、只读/禁用状态、提交/取消键盘行为，以及自定义弹窗的初始焦点、焦点约束和关闭后焦点恢复。默认组件的样式接线见[样式接入](styling.md)。

## 渐进迁移

先选择一个表单使用自定义控件，将事件处理连接到共享控制器；确认标签、错误关联、键盘和焦点行为后再扩展到查询、列表和详情。同页可并存默认组件与 headless 消费方。默认展示复用、列表历史/手动排序和独立消费闭环仍按 US-403 验收，不应据现有 API 提前宣称全部完成。
