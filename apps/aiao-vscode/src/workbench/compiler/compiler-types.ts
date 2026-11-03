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
