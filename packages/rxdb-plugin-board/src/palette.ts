/**
 * @fileoverview 标签预设色（看板 v2 标签编辑对话框，对照 GitHub 选项编辑的 8 色）
 *
 * 预设色只是快捷选择，标签颜色仍可自定义任意 `#rgb` / `#rrggbb`；
 * 文字色由 `labelTextColor` 按对比度挑黑白。
 */

/** 8 个预设色（名称供无障碍名与提示用）。 */
export const BOARD_LABEL_COLORS: readonly { readonly name: string; readonly color: string }[] = [
  { name: '灰', color: '#6e7781' },
  { name: '蓝', color: '#0969da' },
  { name: '绿', color: '#1a7f37' },
  { name: '黄', color: '#d4a72c' },
  { name: '橙', color: '#e16f24' },
  { name: '红', color: '#cf222e' },
  { name: '粉', color: '#bf3989' },
  { name: '紫', color: '#8250df' }
];

/**
 * 新标签的默认色：第一个未被当前板使用的预设色，全部用过后从头循环。
 * 按小写比对、不展开 `#rgb` 短格式：8 个预设色都没有 3 位写法，短格式自定义色不会与预设相撞；
 * 同一颜色的长短两种写法只会在预设全部用完后多算一个「已用」，挪动循环起点。
 */
export const nextLabelColor = (usedColors: readonly string[]): string => {
  const used = new Set(usedColors.map(color => color.toLowerCase()));
  const unused = BOARD_LABEL_COLORS.find(option => !used.has(option.color));
  return (unused ?? BOARD_LABEL_COLORS[used.size % BOARD_LABEL_COLORS.length]).color;
};
