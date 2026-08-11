/**
 * @fileoverview 图查询工具函数
 * 提供邻居查询和路径查询选项的规范化处理
 *
 * @module rxdb-plugin-graph/utils
 */

import { EntityType } from '@aiao/rxdb';
import {
  GRAPH_DEFAULT_MAX_DEPTH,
  GRAPH_DEFAULT_RESULT_LIMIT,
  GRAPH_MAX_DEPTH,
  GRAPH_MAX_LEVEL,
  GRAPH_MAX_RESULT_LIMIT
} from './constants.js';
import { EdgeFilterOptions, FindNeighborsOptions, FindPathsOptions, GraphWhere } from './graph-repository.interface.js';

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min
  : value > max ? max
  : value;

const normalizeResultLimit = (value: number | undefined): number => {
  const limit = value ?? GRAPH_DEFAULT_RESULT_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new RangeError(`graph query limit must be a non-negative safe integer, received: ${String(limit)}`);
  }
  return Math.min(limit, GRAPH_MAX_RESULT_LIMIT);
};

/**
 * 规范化邻居查询选项
 */
export function normalizeNeighborsOptions<
  T extends EntityType,
  U = GraphWhere<T>,
  V extends EdgeFilterOptions = EdgeFilterOptions
>(options: FindNeighborsOptions<T, U, V>, preserveZeroLevel = false): FindNeighborsOptions<T, U, V> {
  const level = options.level ?? 1;
  return {
    ...options,
    direction: options.direction ?? 'both',
    level: preserveZeroLevel && level === 0 ? 0 : clamp(level, 1, GRAPH_MAX_LEVEL),
    limit: normalizeResultLimit(options.limit)
  };
}

/**
 * 规范化路径查询选项
 */
export function normalizePathsOptions<
  T extends EntityType,
  U = GraphWhere<T>,
  V extends EdgeFilterOptions = EdgeFilterOptions
>(options: FindPathsOptions<T, U, V>): FindPathsOptions<T, U, V> {
  return {
    ...options,
    direction: options.direction ?? 'both',
    maxDepth: clamp(options.maxDepth ?? GRAPH_DEFAULT_MAX_DEPTH, 1, GRAPH_MAX_DEPTH),
    limit: normalizeResultLimit(options.limit)
  };
}
