import { numberStep } from './numberStep.js';

/**
 * 根据设备像素比调整数值后，按步长取整
 * 主要用于处理不同DPI屏幕下的尺寸计算，确保在高分辨率屏幕上保持合适的步长
 * @param value - 原始数值
 * @param step - 步长间隔，默认80
 * @param devicePixelRatio - 设备像素比，默认1，用于高DPI屏幕调整
 * @returns 调整后的数值
 * @example
 * numberStepScreenSize(100, 50, 2); // 返回 200（100*2=200，向上取整到50的倍数）
 * numberStepScreenSize(75, 50, 1);  // 返回 100（75向上取整到50的倍数）
 * **注意：** 先将value乘以devicePixelRatio，再应用numberStep逻辑
 * **注意：** 适用于响应式设计中的尺寸计算
 */
export const numberStepScreenSize = (value: number, step = 80, devicePixelRatio = 1) =>
  numberStep(value * devicePixelRatio, step);
