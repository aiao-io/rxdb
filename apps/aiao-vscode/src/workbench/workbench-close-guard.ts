/** 键盘触发的关闭确认：浏览器弹出「离开此网站？系统可能不会保存您所做的更改。」的原生对话框。 */
export interface WorkbenchCloseGuard {
  /** 预览 iframe 拿不到宿主的键盘事件，由它经消息通道上报修饰键是否按下。 */
  setPreviewModifier(pressed: boolean): void;
  dispose(): void;
}

/** PWA 独立窗口里 ⌘W 能被工作台自己拦截，不需要浏览器确认；与 VS Code 一样只在普通标签页启用。 */
function isStandalone(target: Window): boolean {
  const standaloneNavigator = target.navigator as Navigator & { standalone?: boolean };
  return target.matchMedia?.('(display-mode: standalone)').matches === true || standaloneNavigator.standalone === true;
}

/**
 * 对齐 vscode.dev 的 `window.confirmBeforeClose = keyboardOnly`：用键盘关闭网页时弹出浏览器确认，点标签页 × 不弹。
 *
 * Chrome 把 ⌘W / Ctrl+W 当作保留快捷键，页面收不到 W 的按键事件，但能收到先按下的修饰键；
 * 所以跟踪修饰键状态，`beforeunload` 触发时若仍有修饰键按着，就认定是键盘触发的关闭并要求确认。
 * 跟踪规则同 VS Code 的 ModifierKeyEmitter：捕获阶段监听、忽略已被处理的按键、窗口失焦清零。
 */
export function installWorkbenchCloseGuard(target: Window = window): WorkbenchCloseGuard {
  let hostModifier = false;
  let previewModifier = false;
  const track = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return;
    hostModifier = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
  };
  const reset = (): void => {
    hostModifier = false;
  };
  const confirm = (event: BeforeUnloadEvent): void => {
    if (!(hostModifier || previewModifier) || isStandalone(target)) return;
    event.preventDefault();
    event.returnValue = '';
  };
  target.addEventListener('keydown', track, true);
  target.addEventListener('keyup', track, true);
  target.addEventListener('blur', reset);
  target.addEventListener('beforeunload', confirm);
  return {
    setPreviewModifier(pressed) {
      previewModifier = pressed;
    },
    dispose() {
      target.removeEventListener('keydown', track, true);
      target.removeEventListener('keyup', track, true);
      target.removeEventListener('blur', reset);
      target.removeEventListener('beforeunload', confirm);
    }
  };
}
