import { DiskPath } from '../../disk/disk-path';

/**
 * Finder 拖拽路径登记（DOCKREG）：模块级的小注册表，拖拽开始写入被拖条目的卷内路径，
 * 拖拽结束（或取消）清空。Dock 在指针拖文件落到应用图标上时读取它，把文件交给那个应用打开。
 * 一次拖拽只涉及一个 Finder 窗口，所以不按窗口区分；写入时做防御性拷贝，调用方改原数组不影响已登记的路径。
 */
let dragPaths: readonly DiskPath[] | null = null;

/** 拖拽开始写路径，结束（或取消）传 `null` 清空。 */
export function setFinderDrag(paths: readonly DiskPath[] | null): void {
  dragPaths = paths === null ? null : paths.map(path => [...path]);
}

/** 当前正在拖拽的文件路径；没有拖拽时为 `null`。 */
export function finderDragPaths(): readonly DiskPath[] | null {
  return dragPaths;
}
