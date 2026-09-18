import { ListEditor } from '@visactor/vtable-editors';

/**
 * Workaround for VTable `ListEditor` bug:
 * `onEnd` throws TypeError when `element.parentNode` is null
 * during keyboard-triggered cell navigation.
 */
export class SafeListEditor extends ListEditor {
  /** 调用父类 onEnd，吞掉键盘导航场景下 parentNode 为 null 引发的 TypeError */
  override onEnd(): void {
    try {
      super.onEnd();
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
    }
  }
}
