/**
 * 等待指定的毫秒数
 * @param ms - 等待的毫秒数
 * @returns Promise，在指定时间后resolve
 * @example
 * // 等待1秒
 * await sleep(1000);
 * console.log('1秒后执行');
 */
export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
