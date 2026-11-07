/** 键值字符串存储的最小契约，`Storage` 天然满足。 */
export interface StorageLike {
  /** 读取键，不存在返回 `null`。 */
  getItem(key: string): string | null;
  /** 写入键。 */
  setItem(key: string, value: string): void;
  /** 删除键。 */
  removeItem(key: string): void;
}

/**
 * 创建内存存储，用于 SSR、测试或存储不可用时的会话内持久化。
 * @param initial - 初始内容。
 * @returns 内存存储。
 */
export function createMemoryStorage(initial: Readonly<Record<string, string>> = {}): StorageLike {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: key => void entries.delete(key)
  };
}

interface WebStorageHost {
  readonly localStorage?: Storage;
  readonly sessionStorage?: Storage;
}

const resolveHostStorage = (kind: 'local' | 'session', host: WebStorageHost): Storage | undefined => {
  try {
    return kind === 'local' ? host.localStorage : host.sessionStorage;
  } catch {
    return undefined;
  }
};

const swallow = (action: () => void): void => {
  try {
    action();
  } catch {
    // 隐私模式 / 配额 / 权限：持久化失败不应破坏外壳，仅本次会话生效
  }
};

/**
 * 包装浏览器存储。
 *
 * @remarks
 * 宿主没有该存储（SSR / Node）或访问它本身抛错（隐私模式的 SecurityError）时，
 * 退化为内存存储；读写过程中抛错（配额、权限）时读返回 `null`、写入被吞掉。
 * @param kind - `local` 或 `session`。
 * @param host - 宿主对象，缺省为 `globalThis`。
 * @returns 存储实现。
 */
export function createWebStorage(kind: 'local' | 'session', host: WebStorageHost = globalThis): StorageLike {
  const storage = resolveHostStorage(kind, host);
  if (!storage) return createMemoryStorage();
  return {
    getItem: key => {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => swallow(() => storage.setItem(key, value)),
    removeItem: key => swallow(() => storage.removeItem(key))
  };
}
