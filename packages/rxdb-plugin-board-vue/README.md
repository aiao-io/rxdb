# Vue 看板

`BoardView` 消费已连接的看板 RxDB 实例。应用入口同时加载发布包的样式：

```ts
import { BoardView } from '@aiao/rxdb-plugin-board-vue';
import '@aiao/rxdb-plugin-board-vue/index.css';
```

样式包含列布局、详情面板和拖拽落点反馈。`useBoard` 提供领域数据与动作，独立使用时无需加载视图样式。
