/** 错误上报本身失败时保留诊断，不中断通知、回包或清理。 */
export function reportSafely(report: () => void): void {
  try {
    report();
  } catch (error) {
    console.error(error);
  }
}

/** 注册中途失败与正常解绑共用同一条逆序清理路径。 */
export function registerService(register: (add: (off: () => void) => void) => void): () => void {
  const offs: (() => void)[] = [];
  const dispose = () => {
    for (const off of offs.splice(0).reverse()) reportSafely(off);
  };
  try {
    register(off => offs.push(off));
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}
