import type {
  MiniProgramWasmInstance,
  WaSqliteEmscriptenModule,
  WaSqliteMiniProgramOptions,
  WaSqliteModuleFactoryOptions
} from './mini-program.interface.js';
import { DEFAULT_WASM_PATH } from './mini-program.interface.js';

/** 统一处理 `WXWebAssembly.instantiate` 可能返回的两种结构。 */
function unwrapInstance(
  result: MiniProgramWasmInstance | { readonly instance: MiniProgramWasmInstance; readonly module?: unknown }
): { instance: MiniProgramWasmInstance; module?: unknown } {
  if ('instance' in result) return { instance: result.instance, module: result.module };
  return { instance: result };
}

/** 使用 `WXWebAssembly` 加载同步 wa-sqlite Emscripten 模块。 */
export async function loadWaSqliteMiniProgramModule(
  options: Pick<WaSqliteMiniProgramOptions, 'moduleFactory' | 'wasmPath' | 'wasmRuntime'>
): Promise<WaSqliteEmscriptenModule> {
  const wasmPath = options.wasmPath ?? DEFAULT_WASM_PATH;
  let rejectInstantiation!: (reason: Error) => void;
  const instantiationFailure = new Promise<never>((_resolve, reject) => {
    rejectInstantiation = reject;
  });

  const factoryOptions: WaSqliteModuleFactoryOptions = {
    locateFile: () => wasmPath,
    print: message => console.log(`[wa-sqlite-miniprogram] ${message}`),
    printErr: message => console.warn(`[wa-sqlite-miniprogram] ${message}`),
    instantiateWasm: (imports, receiveInstance) => {
      options.wasmRuntime
        .instantiate(wasmPath, imports)
        .then(result => {
          const { instance, module } = unwrapInstance(result);
          if (!instance.exports) throw new Error('WXWebAssembly.instantiate 未返回有效实例');
          receiveInstance(instance, module);
        })
        .catch(error => {
          const detail = error instanceof Error ? error.message : String(error);
          rejectInstantiation(new Error(`WXWebAssembly 无法实例化 ${wasmPath}: ${detail}`, { cause: error }));
        });
      return {};
    }
  };

  return Promise.race([Promise.resolve(options.moduleFactory(factoryOptions)), instantiationFailure]);
}
