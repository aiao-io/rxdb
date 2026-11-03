import { build, initialize } from 'esbuild-wasm';
import {
  compileProject,
  type CompiledProject,
  type CompileProjectInput,
  type CompileProjectOptions
} from './compiler-project.js';

let initialization: Promise<void> | undefined;
let initializedURL: string | undefined;

export interface BrowserCompilerOptions {
  wasmURL: string;
  angularTransform?: CompileProjectOptions['angularTransform'];
  runtimeFiles?: CompileProjectOptions['runtimeFiles'];
  runtimeImports?: CompileProjectOptions['runtimeImports'];
}

/** 在编译 Worker 内初始化固定版本的 WASM 编译器。 */
export async function compileInBrowser(
  input: CompileProjectInput,
  options: BrowserCompilerOptions
): Promise<CompiledProject> {
  if (initializedURL && initializedURL !== options.wasmURL) throw new Error('编译 Worker 不允许切换 WASM 版本');
  if (!initialization) {
    initializedURL = options.wasmURL;
    initialization = initialize({ wasmURL: options.wasmURL, worker: false });
  }
  await initialization;
  return compileProject(input, {
    build,
    angularTransform: options.angularTransform,
    ...(options.runtimeFiles === undefined ?
      {}
    : { runtimeFiles: options.runtimeFiles, runtimeImports: options.runtimeImports })
  });
}
