import { EntityType } from '@aiao/rxdb';
import { FindNeighborsOptions, FindPathsOptions } from './graph-repository.interface.js';

/**
 * FindNeighbors 查询任务
 * 查找指定节点的邻居节点
 */
export interface FindNeighborsQuery<T extends EntityType> {
  type: 'findNeighbors';
  options: FindNeighborsOptions<T>;
}

/**
 * CountNeighbors 查询任务
 * 统计指定节点的邻居节点数量
 */
export interface CountNeighborsQuery<T extends EntityType> {
  type: 'countNeighbors';
  options: FindNeighborsOptions<T>;
}

/**
 * FindPaths 查询任务
 * 查找两个节点之间的所有路径
 */
export interface FindPathsQuery<T extends EntityType> {
  type: 'findPaths';
  options: FindPathsOptions<T>;
}
