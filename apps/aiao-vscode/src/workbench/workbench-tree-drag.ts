/** 文件树拖放一次放下的判定结果。 */
export type TreeMoveDecision =
  /** 无效落点：拖动中不给任何高亮。 */
  | { readonly kind: 'reject' }
  /** 原目录放下：零写，不是错误。 */
  | { readonly kind: 'noop' }
  /** 移动到新目录；`destination` 是移动项（文件或文件夹前缀）的新路径。 */
  | { readonly kind: 'move'; readonly destination: string };

/** 路径的父目录；根级路径的父目录为空串。 */
export const treePathParent = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

/** 路径的末段名称。 */
export const treePathBase = (path: string): string =>
  path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;

/** `path` 是否是有后代文件的文件夹前缀。 */
export const isTreeFolder = (files: readonly string[], path: string): boolean =>
  files.some(file => file.startsWith(`${path}/`));

/**
 * 判定一次 VS Code 资源管理器语义的树拖放。
 *
 * 对齐 vscode.dev 的规则：落在文件夹行上 = 移入该文件夹，落在文件行上 = 移入该文件的父目录，
 * 落在树的空白区（`target` 为 `null`）= 移入根。树恒按字母序渲染，没有前后插位。
 *
 * 拒绝的情况：落到自身或其后代行上、目标目录是被拖文件夹自身或其子孙、目标目录就是当前父目录
 * （noop）、目标路径已存在同名文件或文件夹。
 *
 * @param files - 项目全部文件键
 * @param moved - 被拖动的文件键或文件夹前缀
 * @param target - 落点行对应的路径；`null` 表示树的空白区
 */
export function resolveTreeMove(files: readonly string[], moved: string, target: string | null): TreeMoveDecision {
  if (target !== null) {
    if (target === moved) return { kind: 'reject' };
    if (target.startsWith(`${moved}/`)) return { kind: 'reject' };
  }
  const targetFolder =
    target === null ? ''
    : isTreeFolder(files, target) ? target
    : treePathParent(target);
  if (targetFolder === moved || targetFolder.startsWith(`${moved}/`)) return { kind: 'reject' };
  if (targetFolder === treePathParent(moved)) return { kind: 'noop' };
  const destination = targetFolder ? `${targetFolder}/${treePathBase(moved)}` : treePathBase(moved);
  if (files.some(file => file === destination || file.startsWith(`${destination}/`))) return { kind: 'reject' };
  return { kind: 'move', destination };
}
