export interface RuntimeCapability {
  readonly name: string;
  readonly available: boolean;
  readonly source?: 'missing' | 'native' | 'polyfill' | 'wechat';
  readonly polyfillable?: boolean;
}

export interface MiniProgramRuntimeReferences {
  readonly wechat: WechatMiniProgramApi;
  readonly wasmRuntime: WechatWasmRuntime;
}

function getWechatApi(): WechatMiniProgramApi | undefined {
  return typeof wx === 'undefined' ? undefined : wx;
}

function getWasmRuntime(): WechatWasmRuntime | undefined {
  return typeof WXWebAssembly === 'undefined' ? undefined : WXWebAssembly;
}

function hasFileSystemManager(wechat: WechatMiniProgramApi | undefined): boolean {
  try {
    return !!wechat?.getFileSystemManager();
  } catch {
    return false;
  }
}

function secureRandomCapability(wechat: WechatMiniProgramApi | undefined): RuntimeCapability {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    return { name: 'crypto.getRandomValues', available: true, source: 'native' };
  }
  if (typeof wechat?.getRandomValues === 'function') {
    return { name: 'crypto.getRandomValues', available: true, source: 'wechat' };
  }
  return { name: 'crypto.getRandomValues', available: false, source: 'missing' };
}

export function inspectMiniProgramRuntime(): readonly RuntimeCapability[] {
  const wechat = getWechatApi();
  const wasmRuntime = getWasmRuntime();

  return [
    { name: 'WXWebAssembly.instantiate', available: typeof wasmRuntime?.instantiate === 'function' },
    { name: 'wx.getFileSystemManager', available: hasFileSystemManager(wechat) },
    { name: 'wx.env.USER_DATA_PATH', available: typeof wechat?.env?.USER_DATA_PATH === 'string' },
    { name: 'BigInt', available: typeof globalThis.BigInt === 'function' },
    secureRandomCapability(wechat),
    {
      name: 'TextEncoder',
      available: typeof globalThis.TextEncoder === 'function',
      polyfillable: true
    },
    {
      name: 'TextDecoder',
      available: typeof globalThis.TextDecoder === 'function',
      polyfillable: true
    },
    {
      name: 'performance.now',
      available: typeof globalThis.performance?.now === 'function',
      polyfillable: true
    },
    { name: 'queueMicrotask', available: typeof globalThis.queueMicrotask === 'function' }
  ];
}

export function getMiniProgramRuntimeReferences(): MiniProgramRuntimeReferences {
  const capabilities = inspectMiniProgramRuntime();
  const missing = capabilities.filter(capability => !capability.available && !capability.polyfillable);
  if (missing.length > 0) {
    throw new Error(`微信运行时缺少 RxDB 必需能力: ${missing.map(capability => capability.name).join(', ')}`);
  }

  const wechat = getWechatApi();
  const wasmRuntime = getWasmRuntime();
  if (!wechat || !wasmRuntime) throw new Error('微信运行时初始化失败');
  return { wechat, wasmRuntime };
}
