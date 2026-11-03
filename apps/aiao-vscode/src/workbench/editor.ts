/** 原生编辑器绑定的初始属性。 */
export interface WorkbenchEditorOptions {
  readonly value: string;
  readonly language: string;
  readonly onChange: (value: string) => void;
  readonly onCursor: (line: number, column: number) => void;
}

/** 宿主编辑器可代工作台执行的 VS Code 风格命令。 */
export type WorkbenchEditorCommand = 'gotoLine' | 'selectLine' | 'insertLineAbove';

/** 三端编辑器的共享命令式桥。 */
export interface WorkbenchEditorHandle {
  update(value: string, language: string): void;
  /** 以可撤销事务写入文档并触发 onChange，供格式化等宿主改写使用。 */
  replace(value: string): void;
  /** 面板尺寸或可见性改变后重新测量编辑器。 */
  layout?(): void;
  /** 聚焦编辑器并保留光标与选区。 */
  focus?(): void;
  /** 执行编辑器级命令；返回 false 表示宿主未实现该命令。 */
  runCommand?(command: WorkbenchEditorCommand): boolean;
  dispose(): void;
}

/** 由框架绑定挂载已有 CodeMirror 编辑器。 */
export type WorkbenchEditorMount = (host: HTMLElement, options: WorkbenchEditorOptions) => WorkbenchEditorHandle;
