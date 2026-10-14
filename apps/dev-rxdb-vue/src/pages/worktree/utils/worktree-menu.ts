/**
 * @fileoverview 工具栏下拉（分支菜单 / worktree 菜单）的共享类型。
 *
 * @remarks
 * Vue 的 `<script setup>` 不便导出符号（`ToolbarDropdown.vue` 还是泛型组件），
 * 这里收拢页面、两个包装组件与共享下拉共用的类型。
 */

/** worktree 菜单的创建弹层交给页面的请求；校验与建库调用由页面做（US-310）。 */
export interface WorktreeCreateRequest {
  /** `existing` 钉一条已有分支；`new` 先 `createBranch`（FR-017：会复制当前未提交改动），再钉住 */
  readonly mode: 'existing' | 'new';
  /** 要钉的分支（`new` 时即新分支名，已去掉两端空白） */
  readonly branchId: string;
  /** 显示名；空串即不起名（`undefined`），其余原样透传——全空白由核心以 `WorktreeLabelError` 拒绝 */
  readonly label: string | undefined;
}

/** 工具栏下拉的界面文案；两个包装组件各定义一份常量（三端逐字一致）。 */
export interface ToolbarDropdownCopy {
  /** 触发按钮上的小字（`Current Branch`） */
  readonly caption: string;
  /** 列表头，后接条数（`Branches (3)`） */
  readonly heading: string;
  /** 列表头右侧新建按钮的文字 */
  readonly createButton: string;
  /** 创建弹层（`role="dialog"`）的可访问名 */
  readonly createTitle: string;
  /** 筛选框的占位文字 */
  readonly filterPlaceholder: string;
  /** 筛选框的可访问名 */
  readonly filterLabel: string;
  /** 列表弹层（`role="dialog"`）的可访问名 */
  readonly listLabel: string;
  /** 背板的可访问名（e2e 点它关闭菜单） */
  readonly backdropLabel: string;
  /** 一项都没有时的占位行 */
  readonly empty: string;
  /** 筛选后一项不剩时的占位行 */
  readonly noMatch: string;
}
