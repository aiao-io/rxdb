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

/** 撤销栈里的一笔：`id` 是库里那一行的 id，undo 时按它删除。 */
export interface UndoEntry {
  readonly id: string;
  readonly color: string;
  readonly points: readonly (readonly [number, number])[];
}

/**
 * 笔画级撤销：落笔成功就进栈；undo 弹出最后一笔（进重做栈），redo 弹出重做栈
 * （调用方重新落库、拿到新 id 后再 push 回来，所以重做栈里的旧 id 不再使用）。
 */
export class StrokeUndo {
  private readonly undoList: UndoEntry[] = [];
  private readonly redoList: UndoEntry[] = [];

  push(entry: UndoEntry): void {
    this.undoList.push(entry);
    this.redoList.length = 0;
  }

  undoSize(): number {
    return this.undoList.length;
  }

  redoSize(): number {
    return this.redoList.length;
  }

  undoTop(): UndoEntry | null {
    const entry = this.undoList.at(-1);
    if (!entry) return null;
    this.undoList.pop();
    this.redoList.push(entry);
    return entry;
  }

  redoTop(): UndoEntry | null {
    const entry = this.redoList.at(-1);
    if (!entry) return null;
    this.redoList.pop();
    return entry;
  }

  forgetAll(): void {
    this.undoList.length = 0;
    this.redoList.length = 0;
  }
}
