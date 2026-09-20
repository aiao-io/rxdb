/**
 * @fileoverview 右键菜单的共享类型（页面与列表组件共用）。
 *
 * @remarks
 * Angular 参考实现里这些类型随组件文件导出；Vue 的 `<script setup>` 不能导出符号，
 * 单独收进 utils 供三处 import——页面、变更列表、历史列表。
 */

/** 右键菜单里的一项。 */
export interface WorkingTreeContextMenuItem {
  /** 页面上按它分发动作的键；分隔线占位项也用（互不重复即可）。 */
  readonly id: string;
  readonly label: string;
  /** 危险操作（丢弃）用红色字。 */
  readonly danger?: boolean;
  /** e2e 锚点；只有带测试语义的项才给。 */
  readonly testId?: string;
  /** 分隔线占位项：不渲染按钮（GitHub Desktop 菜单里动作与复制之间的横线）。 */
  readonly separator?: boolean;
}

/** 右键菜单的开合状态：位置 + 菜单项。 */
export interface WorkingTreeContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly items: readonly WorkingTreeContextMenuItem[];
}

/** 列表行上的一次右键；`event` 给页面定位菜单用。 */
export interface WorkingTreeContextMenuRequest<T> {
  readonly target: T;
  readonly event: MouseEvent;
}
