/** 一笔：颜色与依次经过的点（相对画布左上角的 CSS 像素）。 */
export interface Stroke {
  readonly color: string;
  readonly points: readonly (readonly [number, number])[];
}

/** 有身份的一笔：`id` 和库里那一行的 id 相同，用来判断库有没有回报过它。 */
export interface Ink extends Stroke {
  readonly id: string;
}

/** 一笔至少要有两个点才画得出线，也才值得存。 */
export const isStroke = (stroke: Stroke): boolean => stroke.points.length >= 2;

/** 已经松手、库里还没出现的笔迹：库里已有同 id 的那些不必再等。 */
export function unsettled(settling: readonly Ink[], saved: readonly { readonly id: string }[]): readonly Ink[] {
  const known = new Set(saved.map(row => row.id));
  return settling.filter(ink => !known.has(ink.id));
}

/** 画布上应有的全部笔迹，按先后：库里的、刚松手尚未被库回报的、正在画的那一笔。 */
export function visibleStrokes(
  saved: readonly Ink[],
  settling: readonly Ink[],
  drawing: Stroke | null
): readonly Stroke[] {
  return [...saved, ...unsettled(settling, saved), ...(drawing ? [drawing] : [])];
}
