// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { focusModalTab } from '../focus-trap.js';
afterEach(() => {
  document.body.innerHTML = '';
});

it('模态框首尾环绕，排除禁用、隐藏与负tabindex控件，框内中间位置沿用浏览器顺序', () => {
  const root = document.createElement('section');
  root.innerHTML =
    '<div class="rxb-dialog-backdrop"><section aria-modal="true"><button id="first">首项</button><button tabindex="0" disabled>禁用</button><button hidden>隐藏</button><button tabindex="-2">跳过</button><div inert><button>不可交互</button></div><button id="last">末项</button></section></div>';
  document.body.append(root);
  const first = root.querySelector<HTMLButtonElement>('#first')!;
  const last = root.querySelector<HTMLButtonElement>('#last')!;
  expect(focusModalTab(root, false)).toBe(true);
  expect(document.activeElement).toBe(first);
  expect(focusModalTab(root, false)).toBe(false);
  expect(focusModalTab(root, true)).toBe(true);
  expect(document.activeElement).toBe(last);
  expect(focusModalTab(root, false)).toBe(true);
  expect(document.activeElement).toBe(first);
});

it('空模态框聚焦容器并限制Tab，没有模态框时不接管', () => {
  const root = document.createElement('section');
  document.body.append(root);
  expect(focusModalTab(root, false)).toBe(false);
  root.innerHTML = '<div class="rxb-dialog-backdrop"><section aria-modal="true"></section></div>';
  const dialog = root.querySelector<HTMLElement>('section')!;
  expect(focusModalTab(root, true)).toBe(true);
  expect(document.activeElement).toBe(dialog);
  expect(dialog.tabIndex).toBe(-1);
});
