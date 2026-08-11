/**
 * 检测当前环境是否暴露 OPFS API
 * @returns 是否支持 OPFS
 */
export const isOPFSSupported = (): boolean => {
  const navigatorApi = globalThis.navigator as Navigator | undefined;
  return typeof navigatorApi?.storage?.getDirectory === 'function';
};

/**
 * 异步检测 OPFS 是否真正可用
 * @returns 是否可用
 */
export const checkOPFSAvailable = async (): Promise<boolean> => {
  if (!isOPFSSupported()) return false;
  try {
    return Boolean(await globalThis.navigator.storage.getDirectory());
  } catch {
    return false;
  }
};
