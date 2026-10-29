# Angular 看板

`BoardViewComponent`（`<board-view>`）消费已连接的看板 RxDB 实例。宿主在全局样式中加载发布包的样式，例如 `angular.json`：

```json
"styles": ["@aiao/rxdb-plugin-board-angular/board-view.css", "src/styles.css"]
```

样式包含列布局、详情面板和拖拽落点反馈，与 React / Vue 绑定的 `board-view.css` 子路径同名；它转引 peer 依赖 `@aiao/rxdb-plugin-board` 的 `board.css`，由宿主构建按包名解析内联。`useBoard` 提供领域数据与动作，独立使用时无需加载视图样式。
