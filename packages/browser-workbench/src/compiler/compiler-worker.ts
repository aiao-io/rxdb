import { compileInBrowser } from './compiler-browser.js';
import type { CompileProjectInput, CompileProjectOptions } from './compiler-project.js';

interface CompileRequest {
  id: string;
  input: CompileProjectInput;
  wasmURL: string;
  runtimeFiles?: CompileProjectOptions['runtimeFiles'];
  runtimeImports?: CompileProjectOptions['runtimeImports'];
}

globalThis.onmessage = async (event: MessageEvent<CompileRequest>) => {
  const { id, input, wasmURL, runtimeFiles, runtimeImports } = event.data;
  try {
    const angularTransform =
      input.template === 'angular' ? (await import('./angular-compiler.js')).compileAngular : undefined;
    const result = await compileInBrowser(input, {
      wasmURL,
      angularTransform,
      ...(runtimeFiles === undefined ? {} : { runtimeFiles, runtimeImports })
    });
    globalThis.postMessage({ id, result });
  } catch (cause) {
    globalThis.postMessage({ id, error: cause instanceof Error ? cause.message : String(cause) });
  }
};
