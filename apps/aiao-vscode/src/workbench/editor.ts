/** 工作台支持的编辑器引擎。 */
export type WorkbenchEditorEngine = 'codemirror' | 'monaco';

/** 校验持久化的编辑器选择。 */
export function isWorkbenchEditorEngine(value: unknown): value is WorkbenchEditorEngine {
  return value === 'codemirror' || value === 'monaco';
}

/** 两种编辑器之间可迁移的选区与滚动位置。 */
export interface WorkbenchEditorViewState {
  readonly anchor: number;
  readonly head: number;
  readonly scrollTop: number;
  readonly scrollLeft: number;
}

/** 编辑器当前实际可见的文本行。 */
export interface WorkbenchEditorViewport {
  readonly firstLine: number;
  readonly lastLine: number;
}

/** 原生编辑器绑定的初始属性。 */
export interface WorkbenchEditorOptions {
  readonly value: string;
  readonly language: string;
  readonly engine: WorkbenchEditorEngine;
  /** 初始缩进单位，如两空格 `'  '`。 @defaultValue '  ' */
  readonly indentUnit?: string;
  readonly onChange: (value: string) => void;
  readonly onCursor: (line: number, column: number) => void;
  readonly onViewport?: (viewport: WorkbenchEditorViewport) => void;
}

/** 宿主编辑器可代工作台执行的 VS Code 风格命令。 */
export type WorkbenchEditorCommand = 'gotoLine' | 'gotoLineAt' | 'selectLine' | 'insertLineAbove' | 'find';

/** 单个编辑器文件内的诊断位置。 */
export interface WorkbenchEditorDiagnostic {
  readonly line: number;
  readonly column?: number;
  readonly message: string;
}

/** 三端编辑器的共享命令式桥。 */
export interface WorkbenchEditorHandle {
  update(value: string, language: string): void;
  /** 以可撤销事务写入文档并触发 onChange，供格式化等宿主改写使用。 */
  replace(value: string): void;
  /** 面板尺寸或可见性改变后重新测量编辑器。 */
  layout?(): void;
  /** 聚焦编辑器并保留光标与选区。 */
  focus?(): void;
  /** 执行编辑器级命令；`argument` 供 gotoLineAt 等携带行号，返回 false 表示宿主未实现该命令。 */
  runCommand?(command: WorkbenchEditorCommand, argument?: number): boolean;
  /** 调整缩进单位（如两空格），作用于该编辑器实例。 */
  setIndentUnit?(unit: string): void;
  /** 设置该文件的诊断波浪线，空数组清除。 */
  setDiagnostics?(diagnostics: readonly WorkbenchEditorDiagnostic[]): void;
  /** 切换引擎并保留未保存文本与视图位置。 */
  setEngine?(engine: WorkbenchEditorEngine): void;
  /** 读取选区与滚动位置，偏移按 UTF-16 代码单元计算。 */
  getViewState?(): WorkbenchEditorViewState;
  /** 恢复选区与滚动位置，超出文档的偏移由编辑器截断。 */
  restoreViewState?(state: WorkbenchEditorViewState): void;
  /** 预览滚动同步仅改变视区，保留光标、选区和焦点。 */
  scrollToLine?(line: number): void;
  getViewport?(): WorkbenchEditorViewport | undefined;
  dispose(): void;
}

/** 由应用挂载所选编辑器，向工作台提供统一操作接口。 */
export type WorkbenchEditorMount = (host: HTMLElement, options: WorkbenchEditorOptions) => WorkbenchEditorHandle;
