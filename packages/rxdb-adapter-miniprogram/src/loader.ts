import type {
  MiniProgramWasmInstance,
  WaSqliteEmscriptenModule,
  WaSqliteMiniProgramOptions,
  WaSqliteModuleFactoryOptions
} from './mini-program.interface.js';
import { DEFAULT_WASM_PATH } from './mini-program.interface.js';

/** 微信 WASM 运行时全局名，也是未指定运行时名称时报错里使用的名字。 */
const WECHAT_WASM_RUNTIME_NAME = 'WXWebAssembly';

/** 统一处理小程序 `instantiate`（如 `WXWebAssembly.instantiate`）可能返回的两种结构。 */
function unwrapInstance(
  result: MiniProgramWasmInstance | { readonly instance: MiniProgramWasmInstance; readonly module?: unknown }
): { instance: MiniProgramWasmInstance; module?: unknown } {
  if ('instance' in result) return { instance: result.instance, module: result.module };
  return { instance: result };
}

/**
 * 使用小程序 WASM 运行时加载同步 wa-sqlite Emscripten 模块。
 *
 * @param options - 模块工厂、wasm 路径与 WASM 运行时
 * @param wasmRuntimeName - 报错里显示的运行时名称，取自宿主的 `wasmRuntimeName`；默认 `WXWebAssembly`
 */
export async function loadWaSqliteMiniProgramModule(
  options: Pick<WaSqliteMiniProgramOptions, 'moduleFactory' | 'wasmPath' | 'wasmRuntime'>,
  wasmRuntimeName: string = WECHAT_WASM_RUNTIME_NAME
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
          if (!instance.exports) throw new Error(`${wasmRuntimeName}.instantiate 未返回有效实例`);
          receiveInstance(instance, module);
        })
        .catch(error => {
          const detail = error instanceof Error ? error.message : String(error);
          rejectInstantiation(new Error(`${wasmRuntimeName} 无法实例化 ${wasmPath}: ${detail}`, { cause: error }));
        });
      return {};
    }
  };

  return Promise.race([Promise.resolve(options.moduleFactory(factoryOptions)), instantiationFailure]);
}
