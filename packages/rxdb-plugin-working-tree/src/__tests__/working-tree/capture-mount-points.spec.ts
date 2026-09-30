/**
 * @fileoverview 挂载点注册表在本包是**转出口**，不是第二份声明。
 *
 * @remarks
 * 这张表的内容判据（宿主限定在写原语上、`mergeChanges` 两个重载按形参名序列区分、
 * 序号 4 的两行必须都在、`rawQuery` 不属于这张表）已经全部搬到核心，在
 * `packages/rxdb/src/__tests__/capture/capture-mount-points.spec.ts` 里跑——那边能用
 * 同包相对路径 `?raw` 读 `rxdb-adapter.ts`，也能实测装卸往返，因此判据比这里强。
 *
 * 本文件只剩一条本包**独有**的判据：从 `@aiao/rxdb-plugin-working-tree` 读到的这张表，
 * 必须**就是**核心那一份（同一个引用、同一个函数），而不是又抄了一遍。抄一遍不会红任何
 * 类型或运行时断言——两份内容一开始总是一致的，分歧要等到核心改了之后才出现，而那时
 * 这里已经不会响了。所以判据只能是引用相等本身。
 */

import {
  WORKING_TREE_CAPTURE_MOUNT_POINTS as CORE_MOUNT_POINTS,
  WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS as CORE_MOUNT_POINT_METHODS,
  isWorkingTreeCaptureMountPoint as coreIsCaptureMountPoint
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  WORKING_TREE_CAPTURE_MOUNT_POINTS,
  WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS,
  isWorkingTreeCaptureMountPoint
} from '../../working-tree/capture-mount-points.js';

describe('捕获挂载点注册表由核心单源提供', () => {
  it('表是核心那一份，不是内容相同的副本', () => {
    expect(WORKING_TREE_CAPTURE_MOUNT_POINTS).toBe(CORE_MOUNT_POINTS);
    expect(WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS).toBe(CORE_MOUNT_POINT_METHODS);
  });

  it('判别函数也是核心那一个', () => {
    expect(isWorkingTreeCaptureMountPoint).toBe(coreIsCaptureMountPoint);
  });

  it('转出口没有顺手改写表的内容', () => {
    expect(WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS).toEqual([
      'transaction',
      'mergeChanges',
      'switchBranch',
      'upsertMany',
      'deleteByIds'
    ]);
    expect(WORKING_TREE_CAPTURE_MOUNT_POINTS.length).toBe(WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS.length);
  });
});
