# Vue 看板

`BoardView` 消费已连接的看板 RxDB 实例。应用入口同时加载发布包的样式：

```ts
import { BoardView } from '@aiao/rxdb-plugin-board-vue';
import '@aiao/rxdb-plugin-board-vue/board-view.css';
```

样式包含列布局、详情面板和拖拽落点反馈，与 React / Angular 绑定的 `board-view.css` 子路径同名。`useBoard` 提供领域数据与动作，独立使用时无需加载视图样式。

需要启动选择与备份恢复时改用外壳 `BoardShell`：它按核心包 `BoardShellController` 的编排先显示「新建空看板 / 装载演示数据 / 从备份恢复」（选择前不连接），看板阶段提供「重置为演示数据 / 从备份恢复」，恢复到新库名后整页重载、读回成功才切换。宿主只给实例工厂与可选的演示数据（挂载时读取一次）：

```vue
<script lang="ts" setup>
import { BoardShell } from '@aiao/rxdb-plugin-board-vue';
import type { BoardShellOptions } from '@aiao/rxdb-plugin-board';

const shellOptions: BoardShellOptions = { createRxdb, adapterName: 'sqlite-wasm', seed: seedReleaseBoardDataset };
</script>

<template>
  <BoardShell :options="shellOptions" />
</template>
```
