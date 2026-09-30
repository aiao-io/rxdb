/**
 * @fileoverview `@visactor/vtable-editors` 的测试替身模块（vi.mock 工厂目标）。
 *
 * rxdb-model 的 `createListTable` 会构造 `InputEditor` / `ListEditor` 注册编辑器；
 * 真实编辑器依赖 canvas 事件与布局，happy-dom 里只构造不调用即可，替身只保留类形。
 *
 * @internal 仅测试使用，不随库发布。
 */

/** 替身编辑器基类（只被 `new`，不被驱动）。 */
export class InputEditor {}

/** 替身列表编辑器（SafeListEditor 继承它，只覆盖 onEnd）。 */
export class ListEditor {
  onEnd(): void {
    // 替身：无真实编辑器状态
  }
}

/** 替身多行文本编辑器（multilineText / richText / code 列注册用）。 */
export class TextAreaEditor {}
