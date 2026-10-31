# Angular 看板

`BoardViewComponent`（`<board-view>`）消费已连接的看板 RxDB 实例。宿主在全局样式中加载发布包的样式，例如 `angular.json`：

```json
"styles": ["@aiao/rxdb-plugin-board-angular/board-view.css", "src/styles.css"]
```

样式包含列布局、详情面板和拖拽落点反馈，与 React / Vue 绑定的 `board-view.css` 子路径同名；它转引 peer 依赖 `@aiao/rxdb-plugin-board` 的 `board.css`，由宿主构建按包名解析内联。`useBoard` 提供领域数据与动作，独立使用时无需加载视图样式。

需要启动选择与备份恢复时改用外壳 `BoardShellComponent`（`<board-shell>`）：它按核心包 `BoardShellController` 的编排先显示「新建空看板 / 装载演示数据 / 从备份恢复」（选择前不连接），看板阶段提供「重置为演示数据 / 从备份恢复」，恢复到新库名后整页重载、读回成功才切换。宿主只给实例工厂与可选的演示数据（初始化时读取一次）：

```ts
@Component({
  imports: [BoardShellComponent],
  template: `<board-shell [options]="options" />`
})
export class BoardPage {
  protected readonly options: BoardShellOptions = {
    createRxdb,
    adapterName: 'sqlite-wasm',
    seed: seedReleaseBoardDataset
  };
}
```
