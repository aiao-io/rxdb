/**
 * 获取当前 Unix 时间戳（秒）
 * @returns 当前时间的 Unix 时间戳（整数秒）
 */
export const unixTimestamp = () => Math.floor(Date.now() / 1000);
