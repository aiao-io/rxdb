/**
 * 将数值向上取整到最接近的步长倍数
 * 常用于表单控件、网格布局等需要按固定间隔取值的场景
 *
 * @param value - 需要取整的数值
 * @param step - 步长间隔，必须为正数
 * @returns 向上取整后的数值，是step的整数倍
 * @example
 * numberStep(7, 5);   // 返回 10（5的2倍）
 * @example
 * numberStep(5, 5);   // 返回 5（5的1倍）
 * @example
 * numberStep(3.2, 2); // 返回 4（2的2倍）
 * @example
 * numberStep(0.5, 1); // 返回 1（1的1倍）
 * **注意：** 实现原理：value除以step后向上取整，再乘以step
 * **警告：** step必须为正数，否则可能导致非预期结果或除以零错误
 */
export const numberStep = (value: number, step: number) => {
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError(`step must be a positive finite number, got ${step}`);
  }
  return Math.ceil(value / step) * step;
};
