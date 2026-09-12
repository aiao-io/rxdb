/**
 * 在小程序逻辑层求值的探针函数。
 *
 * 这些函数体**不在 Node 里执行**：automator 把它们 `toString()` 之后交给微信开发者工具，
 * 在小程序的 JS 引擎里跑。所以下面这条 `declare` 声明的是「目标运行时的全局」，
 * 而不是本项目的依赖——它是模块级的，不会泄漏到别的文件。
 */
declare const wx: {
  readonly env: { readonly USER_DATA_PATH: string };
  getFileSystemManager(): { rmdirSync(path: string, recursive: boolean): void };
};

/** 随机源实现上的来源标记，与 `runtime-polyfills.ts` 的 `RUNTIME_SOURCE_MARKER` 对齐。 */
export const RUNTIME_SOURCE_MARKER = '__aiaoMiniProgramRuntimeSource';

/** 取样指纹去重表挂在小程序全局上的键名；只服务于 e2e，与被测代码无关。 */
export const RANDOM_DRAW_REGISTRY_KEY = '__aiaoE2eRandomDraws';

/** 一次随机源取样的结果。 */
export interface RandomDrawReport {
  /** 实际完成的取样次数。 */
  readonly draws: number;
  /** 与此前所有取样重复的次数；密码学随机源下应恒为 0。 */
  readonly duplicates: number;
  /** 取到全零的次数；池被擦过头或备池装不下时会出现。 */
  readonly zeroDraws: number;
  /** 取样过程中抛出的错误信息，没有则为空。 */
  readonly error: string;
}

/** 删掉落盘的数据库目录。 */
export function clearDatabaseDirectory(directory: string): string {
  const path = `${wx.env.USER_DATA_PATH}/${directory}`;
  try {
    wx.getFileSystemManager().rmdirSync(path, true);
  } catch {
    // 目录不存在就已经是干净状态
  }
  return path;
}

/** 读出 `crypto.getRandomValues` 的来源标记（native / polyfill / wechat）。 */
export function readRandomSource(marker: string): string {
  const impl = globalThis.crypto?.getRandomValues as unknown as Record<string, unknown> | undefined;
  if (typeof impl !== 'function') return 'missing';
  const source = impl[marker];
  return typeof source === 'string' ? source : 'native';
}

/**
 * 同步连续取样，并把指纹累加进一个跨调用存活的全局 Set。
 *
 * 去重表必须跨 `evaluate` 存活，否则「跨池轮换有没有发重复字节」根本验不到——
 * 每次调用各自为政的话，两池之间的重复正好落在观察窗口之外。
 * 反过来，**两次 `evaluate` 之间的 WebSocket 往返就是给后台补给的让位时机**：
 * 池的补给是异步的，同步路径不交还事件循环就永远等不到备池。
 */
export function drawRandomValues(registryKey: string, draws: number, bytesPerDraw: number): RandomDrawReport {
  const scope = globalThis as unknown as Record<string, Set<string> | undefined>;
  const seen = scope[registryKey] ?? new Set<string>();
  scope[registryKey] = seen;

  const buffer = new Uint8Array(bytesPerDraw);
  let duplicates = 0;
  let zeroDraws = 0;
  let completed = 0;

  try {
    while (completed < draws) {
      globalThis.crypto.getRandomValues(buffer);
      let fingerprint = '';
      let nonZero = 0;
      // 不用 for...of：探针函数是 toString() 后送进小程序引擎的，
      // 一旦转译器注入 __values 辅助函数就带不过去。
      for (let index = 0; index < buffer.length; index += 1) {
        const byte = buffer[index];
        fingerprint += byte.toString(16).padStart(2, '0');
        nonZero += byte;
      }
      if (nonZero === 0) zeroDraws += 1;
      if (seen.has(fingerprint)) duplicates += 1;
      seen.add(fingerprint);
      completed += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { draws: completed, duplicates, zeroDraws, error: message };
  }

  return { draws: completed, duplicates, zeroDraws, error: '' };
}
