import { compileInBrowser } from './compiler-browser.js';
import type { CompileProjectInput, CompileProjectOptions } from './compiler-project.js';
import type { WorkbenchDiagnostic } from './compiler-types.js';

interface CompileRequest {
  id: string;
  input: CompileProjectInput;
  wasmURL: string;
  runtimeFiles?: CompileProjectOptions['runtimeFiles'];
  runtimeImports?: CompileProjectOptions['runtimeImports'];
}

/** esbuild 失败形态：`errors` 数组内带 `location` 的消息。 */
function esbuildDiagnostics(cause: unknown): WorkbenchDiagnostic[] | undefined {
  const errors = (cause as { errors?: unknown } | null | undefined)?.errors;
  if (!Array.isArray(errors)) return undefined;
  const diagnostics: WorkbenchDiagnostic[] = [];
  for (const item of errors) {
    const entry = item as { text?: unknown; location?: { file?: unknown; line?: unknown; column?: unknown } };
    if (typeof entry.text !== 'string') continue;
    const raw = typeof entry.location?.file === 'string' ? entry.location.file : '';
    diagnostics.push({
      file: raw.startsWith('workbench:/') ? raw.slice('workbench:/'.length) : raw,
      line: typeof entry.location?.line === 'number' ? entry.location.line : undefined,
      column: typeof entry.location?.column === 'number' ? entry.location.column : undefined,
      message: entry.text
    });
  }
  return diagnostics.length ? diagnostics : undefined;
}

/** 以 `file:line:column message` 为前缀的错误消息（Angular 转译等）。 */
function prefixedDiagnostic(message: string): WorkbenchDiagnostic[] | undefined {
  const match = /^(.+?):(\d+):(\d+)\s+(.*)$/s.exec(message);
  if (!match) return undefined;
  return [{ file: match[1], line: Number(match[2]), column: Number(match[3]), message: match[4] }];
}

globalThis.onmessage = async (event: MessageEvent<CompileRequest>) => {
  // 专用 Worker 的宿主通道不携带 Window 来源，只接受浏览器分发的消息。
  if (!event.isTrusted || event.origin !== '' || event.source !== null) return;
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
    const message = cause instanceof Error ? cause.message : String(cause);
    const diagnostics = esbuildDiagnostics(cause) ?? prefixedDiagnostic(message);
    globalThis.postMessage({ id, error: message, diagnostics });
  }
};
