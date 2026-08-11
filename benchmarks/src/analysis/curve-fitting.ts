/**
 * 性能曲线拟合工具，用于可扩展性分析
 */

import { linearRegression, rSquared } from 'simple-statistics';

export interface DataPoint {
  x: number; // 数据规模（例如条目数）
  y: number; // 耗时（毫秒）
}

export type ComplexityType = 'constant' | 'logarithmic' | 'linear' | 'quadratic' | 'exponential';

export interface CurveFittingResult {
  complexity: ComplexityType;
  rSquared: number; // 拟合优度 R²（0-1）
  prediction: (x: number) => number; // 预测函数：给定 x 返回估计的 y
}

/** 单个候选模型：仅描述复杂度与其 x→y 预测函数 */
interface CandidateModel {
  complexity: ComplexityType;
  prediction: (x: number) => number;
}

/**
 * 在**原始 y 空间**统一计算 R²。
 *
 * 关键点：对数/指数等模型在拟合时使用了变换坐标（log(x) 或 log(y)），
 * 若直接采用变换空间里的 R² 进行模型比较是**不可比**的（残差量纲不同）。
 * 这里对所有模型一律用真实 y 与模型预测值计算 R²，确保选择是同口径的。
 * 当结果非有限（如指数溢出）时返回 -Infinity，使其不会被误选为最佳。
 */
function r2InYSpace(points: DataPoint[], prediction: (x: number) => number): number {
  const xy: Array<[number, number]> = points.map(p => [p.x, p.y]);
  const value = rSquared(xy, (x: number) => prediction(x));
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

/**
 * 对性能数据点进行曲线拟合并判定时间复杂度
 *
 * @param dataPoints - 数据点数组（x：数据规模，y：耗时）
 * @returns 曲线拟合结果，包含复杂度类型与 R² 值
 *
 * @example
 * ```ts
 * const points = [
 *   { x: 1000, y: 10 },
 *   { x: 10000, y: 100 },
 *   { x: 100000, y: 1000 }
 * ];
 * const result = fitPerformanceCurve(points);
 * // result.complexity === 'linear'
 * // result.rSquared > 0.9
 * ```
 */
export function fitPerformanceCurve(dataPoints: DataPoint[]): CurveFittingResult {
  if (dataPoints.length < 2) {
    return {
      complexity: 'constant',
      rSquared: 0,
      prediction: () => dataPoints[0]?.y ?? 0
    };
  }

  // 尝试多种模型；R² 统一在原始 y 空间计算后再比较，选择最高者
  const models: CandidateModel[] = [
    fitConstant(dataPoints),
    fitLogarithmic(dataPoints),
    fitLinear(dataPoints),
    fitQuadratic(dataPoints),
    fitExponential(dataPoints)
  ];

  const scored: CurveFittingResult[] = models.map(model => ({
    complexity: model.complexity,
    prediction: model.prediction,
    rSquared: r2InYSpace(dataPoints, model.prediction)
  }));

  const best = scored.reduce((acc, current) => (current.rSquared > acc.rSquared ? current : acc));
  // y 方差为 0（所有点相等）时 R² 无定义，规范化为 0 以便展示
  return { ...best, rSquared: Number.isFinite(best.rSquared) ? best.rSquared : 0 };
}

/**
 * 常量模型拟合：y = c
 */
function fitConstant(points: DataPoint[]): CandidateModel {
  const avgY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return {
    complexity: 'constant',
    prediction: () => avgY
  };
}

/**
 * 对数模型拟合：y = a * log(x) + b
 */
function fitLogarithmic(points: DataPoint[]): CandidateModel {
  const data: Array<[number, number]> = points.map(p => [Math.log(p.x), p.y]);
  const { m: slope, b: intercept } = linearRegression(data);
  return {
    complexity: 'logarithmic',
    prediction: (x: number) => slope * Math.log(x) + intercept
  };
}

/**
 * 线性模型拟合：y = a * x + b
 */
function fitLinear(points: DataPoint[]): CandidateModel {
  const data: Array<[number, number]> = points.map(p => [p.x, p.y]);
  const { m: slope, b: intercept } = linearRegression(data);
  return {
    complexity: 'linear',
    prediction: (x: number) => slope * x + intercept
  };
}

/**
 * 二次模型拟合：y = a * x² + b
 */
function fitQuadratic(points: DataPoint[]): CandidateModel {
  const data: Array<[number, number]> = points.map(p => [p.x * p.x, p.y]);
  const { m: slope, b: intercept } = linearRegression(data);
  return {
    complexity: 'quadratic',
    prediction: (x: number) => slope * x * x + intercept
  };
}

/**
 * 指数模型拟合：y = a * e^(b*x)
 *
 * 通过对数变换 log(y) = log(a) + b * x 在线性空间求参，
 * 但最终 R² 仍在原始 y 空间评估（见 r2InYSpace）。
 */
function fitExponential(points: DataPoint[]): CandidateModel {
  const data: Array<[number, number]> = points.map(p => [p.x, Math.log(Math.max(p.y, 0.001))]);
  const { m: slope, b: intercept } = linearRegression(data);
  const a = Math.exp(intercept);
  return {
    complexity: 'exponential',
    prediction: (x: number) => a * Math.exp(slope * x)
  };
}
