# @aiao/rxdb-model-react

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
