/** 浏览器工作台支持的受控项目模板。 */
export type ProjectTemplate = 'vanilla' | 'react' | 'vue' | 'angular';

/** 编译器接收的不可变项目快照。 */
export interface CompileProjectInput {
  files: Record<string, string | Uint8Array>;
  template: ProjectTemplate;
  entry: string;
  styles?: readonly string[];
  inlineCSS?: string;
}

/** 预览所需的编译结果。 */
export interface CompiledProject {
  js: string;
  css: string;
  html?: string;
}

/** 一次编译失败中可定位到文件与行的诊断。 */
export interface WorkbenchDiagnostic {
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  readonly message: string;
}

/** 携带结构化诊断的编译失败，宿主可据此渲染可点击的问题条目。 */
export class CompilationError extends Error {
  constructor(
    message: string,
    readonly diagnostics: readonly WorkbenchDiagnostic[]
  ) {
    super(message);
    this.name = 'CompilationError';
  }
}
