# @aiao/rxdb-model-react

## Headless 绑定

从 `@aiao/rxdb-model-react/headless` 使用 `useEntityForm`、`useQueryBuilder`、`useEntityList`、`useEntityDetail`、`useEntityDialog` 和 `useQueryTable`。这些 hooks 返回 `{ controller, snapshot }`，使用稳定外部快照缓存，支持 StrictMode 的 effect 清理/重连；真正卸载后在微任务中释放控制器。字段、模式与关系候选更新保留未提交草稿，内容变化的 `data` / `entity` 才重置输入。只使用该入口不需要 VTable 或 Tailwind。

列表切换查询、排序或页码后调用 `refresh()` 执行数据源，过期请求不会回写。批量删除可能部分成功并以 `AggregateError.errors` 报告失败项；详情保存拒绝重复调用，取消/关闭或输入切换后的迟到结果不会覆盖新会话。默认 QueryBuilder、列表和详情尚未全部复用新控制器，headless 历史/手动排序与完整独立 UI 示例仍待完成。

[`@aiao/rxdb-model`](../rxdb-model) 的 React 组件层：元数据驱动的实体列表、详情、表单、对话框、可编辑表格与查询构建器。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-react @aiao/rxdb-model @aiao/rxdb-model-react @aiao/rxdb-plugin-history react rxjs @visactor/vtable lucide-react
```

## 用法

```tsx
import { EntityList } from '@aiao/rxdb-model-react';

<EntityList namespace="public" name="Todo" />;
```

需要自定义控件时可从 `@aiao/rxdb-model-react/headless` 使用 `useEntityForm` / `useEntityFormHeadless`。Hook 返回共享的 `controller` 和 `snapshot`，消费方自行渲染 DOM；卸载时会自动释放订阅，因此不要求 Tailwind、daisyUI 或 VTable。三框架等价用法见[Headless 实体能力](../../website/docs/entity-model/headless.md)。

## 样式

组件样式（对话框 / 表格 / 拖拽指示等）打包在 `dist/index.css`，引入一次即可：

```ts
import '@aiao/rxdb-model-react/index.css';
```

模板使用 daisyUI 工具类（`btn` / `tabs` / `menu` / `fieldset` 等），
由消费方在 Tailwind 入口引入本库的扫描注册文件：

```css
@import '@aiao/rxdb-model-react/tailwind.css';
```
