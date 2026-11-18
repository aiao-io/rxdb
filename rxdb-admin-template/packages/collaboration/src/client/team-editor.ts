import type { RxDB } from '@aiao/rxdb';

/** 交给应用编辑界面的上下文：团队库与当前打开的任务。 */
export interface TeamEditorContext {
  /**
   * 团队库：已连接、已启用 working-tree，并且已切到当前任务的分支。实体列表与表单经它读写，
   * 每次保存都经 working-tree 的捕获进入任务工作树（「已保存未提交」），同步时才形成提交。
   */
  readonly database: RxDB;
  /** 当前任务的 ID 与名称（名称是用户数据，原样显示）。 */
  readonly task: { readonly id: string; readonly name: string };
}

/**
 * 应用提供的编辑界面（ADMIN-US-221 AC#4）：在 `container` 里用模型驱动组件渲染团队库的实体列表与表单，
 * 实体与字段的标签来自实体元数据，协作包不认识任何具体实体。三端分别用 React 的 `createRoot`、Angular 的
 * `createComponent` 与 Vue 的 `createApp` 实现，提供同一个数据库（`RxDBProvider` / 注入 `RxDB` / `provideRxDB`）。
 *
 * @remarks
 * 协作包在任务打开（团队库切到任务分支）之后调用一次；任务切换、关闭、会话锁定或卸载协作界面之前调用返回的卸载函数，
 * 之后才切分支或关库。同一任务打开期间 `container` 一直是同一个元素，不随协作面板重绘而重建。
 * @returns 卸载函数：卸载组件并清空 `container`。
 */
export type RenderTeamEditor = (container: HTMLElement, context: TeamEditorContext) => () => void;
