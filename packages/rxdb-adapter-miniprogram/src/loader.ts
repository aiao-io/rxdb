import type {
  MiniProgramHost,
  MiniProgramWasmInstance,
  WaSqliteEmscriptenModule,
  WaSqliteMiniProgramOptions,
  WaSqliteModuleFactoryOptions
} from './mini-program.interface.js';
import { DEFAULT_WASM_PATH } from './mini-program.interface.js';

/** 加载 wasm 用到的宿主字段。 */
export type MiniProgramWasmHost = Pick<MiniProgramHost, 'wasmRuntimeName' | 'defaultWasmPath'>;

/**
 * 解析代码包内 wasm 路径：显式 `wasmPath` 优先，其次宿主默认值，最后 {@link DEFAULT_WASM_PATH}。
 *
 * @internal 加载与客户端身份比较共用，保证两边看到同一个路径
 */
export function resolveMiniProgramWasmPath(
  options: Pick<WaSqliteMiniProgramOptions, 'wasmPath'>,
  host: MiniProgramWasmHost
): string {
  return options.wasmPath ?? host.defaultWasmPath ?? DEFAULT_WASM_PATH;
}

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
 * @param host - 宿主：`wasmRuntimeName` 用于报错，`defaultWasmPath` 在未传 `wasmPath` 时使用
 */
export async function loadWaSqliteMiniProgramModule(
  options: Pick<WaSqliteMiniProgramOptions, 'moduleFactory' | 'wasmPath' | 'wasmRuntime'>,
  host: MiniProgramWasmHost
): Promise<WaSqliteEmscriptenModule> {
  const { wasmRuntimeName } = host;
  const wasmPath = resolveMiniProgramWasmPath(options, host);
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
