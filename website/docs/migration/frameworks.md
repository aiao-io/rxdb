# 框架绑定迁移

模型定义、查询语义与适配器在三个框架间**完全一致**；迁移只涉及 UI 绑定层的替换。同一套 `@Entity` 与 `Todo.find(...)` 代码无需改动。

## 三框架 API 对照

| 能力           | Angular (`@aiao/rxdb-angular`) | React (`@aiao/rxdb-react`) | Vue (`@aiao/rxdb-vue`)     |
| :------------- | :----------------------------- | :------------------------- | :------------------------- |
| 提供数据库实例 | `provideRxDB(db)`              | `<RxDBProvider db={db}>`   | `provideRxDB(db)` / plugin |
| 读取数据库     | `injectRxDB()`                 | `useRxDB()`                | `useRxDB()`                |
| 基础查询       | `injectFind` / `injectGet` …   | `useFind` / `useGet` …     | `useFind` / `useGet` …     |
| 无限滚动       | `injectInfiniteScroll`         | `useInfiniteScroll`        | `useInfiniteScroll`        |
| 全文搜索       | `useSearch`                    | `useSearch`                | `useSearch`                |

查询 hook 三端同名（Angular 以 `inject*` / `use*` 前缀提供同名能力），返回结构一致：`{ value, error, isLoading, isEmpty, hasValue }`。

## 从 React 迁移到 Vue（示例）

业务模型不变，仅替换组件层：

```tsx
// React
import { useFind } from '@aiao/rxdb-react';

function TodoList() {
  const { value: todos, isLoading } = useFind(Todo, {
    where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] }
  });
  if (isLoading) return <p>加载中...</p>;
  return (
    <ul>
      {todos?.map(t => (
        <li key={t.id}>{t.title}</li>
      ))}
    </ul>
  );
}
```

```vue
<!-- Vue -->
<script lang="ts" setup>
import { useFind } from '@aiao/rxdb-vue';

const { value: todos, isLoading } = useFind(Todo, {
  where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] }
});
</script>

<template>
  <p v-if="isLoading">加载中...</p>
  <ul v-else>
    <li v-for="t in todos" :key="t.id">{{ t.title }}</li>
  </ul>
</template>
```

## 升级框架主版本

- 框架绑定通过 `peerDependencies` 声明框架版本范围（见[兼容矩阵](../compatibility.md)）。
- 升级 Angular / React / Vue 主版本前，确认目标版本落在对应绑定包的 peer 范围内。
- 所有 `@aiao/*` 包同步版本号，升级绑定包时**与核心包保持同一版本**。

## 注意事项

1. 迁移框架不需要数据搬运 —— 底层数据库与适配器不变。
2. 三端要求**同功能同 API**；若你封装了跨框架的共享逻辑，只需替换绑定层导入。

## 参考

- 各框架完整指南见「框架集成」章节
- [适配器切换与数据迁移](./adapters.md)
