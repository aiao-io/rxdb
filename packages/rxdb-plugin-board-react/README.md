# React 看板

`BoardView` 消费已连接的看板 RxDB 实例。应用入口同时加载发布包的样式：

```ts
import { BoardView } from '@aiao/rxdb-plugin-board-react';
import '@aiao/rxdb-plugin-board-react/board-view.css';
```

样式包含列布局、详情面板和拖拽落点反馈，与 Angular / Vue 绑定的 `board-view.css` 子路径同名。`useBoard` 提供领域数据与动作，独立使用时无需加载视图样式。
