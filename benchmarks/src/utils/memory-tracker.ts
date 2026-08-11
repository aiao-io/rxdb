/**
 * 内存跟踪工具，用于性能分析
 */

import { linearRegression, rSquared } from 'simple-statistics';

interface ChromePerformanceMemory {
  usedJSHeapSize: number;
}

/**
 * @internal
 */
declare global {
  interface Performance {
    memory?: ChromePerformanceMemory;
  }
}

export interface MemorySample {
  timestamp: number;
  usedMemory: number; // bytes
  dataSize: number; // number of records
}

export interface MemoryGrowthAnalysis {
  samples: MemorySample[];
  isLinear: boolean;
  rSquared: number;
  bytesPerRecord: number;
  /** performance.memory 是否可用；为 false 时其余数值无意义（仅 Chromium 且开启精确内存信息时可用） */
  supported: boolean;
}

/**
 * 在测试期间跟踪内存使用情况
 */
export class MemoryTracker {
  private samples: MemorySample[] = [];
  private startTime = 0;

  /**
   * 开始采样内存使用
   */
  start(): void {
    this.samples = [];
    this.startTime = performance.now();
    this.sample(0);
  }

  /**
   * 记录一次内存采样
   *
   * @param dataSize - 当前数据库中的记录数量
   */
  sample(dataSize: number): void {
    const memory = performance.memory?.usedJSHeapSize ?? 0;

    this.samples.push({
      timestamp: performance.now() - this.startTime,
      usedMemory: memory,
      dataSize
    });
  }

  /**
   * 分析内存增长模式，判断是否线性增长
   *
   * @returns 包含样本、线性判定、R² 值和每条记录占用字节数的分析结果
   */
  analyze(): MemoryGrowthAnalysis {
    // performance.memory 不可用时，所有采样的 usedMemory 都为 0，相关分析无意义
    const supported = this.samples.some(s => s.usedMemory > 0);

    if (!supported || this.samples.length < 2) {
      return {
        samples: this.samples,
        isLinear: true,
        rSquared: supported ? 1 : 0,
        bytesPerRecord: 0,
        supported
      };
    }

    // 线性回归：memory = slope * dataSize + intercept
    const data: Array<[number, number]> = this.samples.map(s => [s.dataSize, s.usedMemory]);
    const { m: slope, b: intercept } = linearRegression(data);

    // 当 y 恒定（ssTotal = 0）时 rSquared 返回 NaN，规范化为 1（完美拟合一个常量）
    const rawR2 = rSquared(data, (x: number) => slope * x + intercept);
    const r2 = Number.isFinite(rawR2) ? rawR2 : 1;

    return {
      samples: this.samples,
      isLinear: r2 > 0.9,
      rSquared: r2,
      bytesPerRecord: slope,
      supported
    };
  }

  /**
   * 获取当前内存使用（单位 MB）
   */
  getCurrentMemoryMB(): number {
    const bytes = performance.memory?.usedJSHeapSize ?? 0;
    return bytes / 1024 / 1024;
  }

  /**
   * 清空所有采样数据
   */
  clear(): void {
    this.samples = [];
  }
}
