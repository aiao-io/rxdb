import { afterEach, describe, expect, it, vi } from 'vitest';
import { restoreFocus, tabbableIn, trapTabKey } from './focus-trap';

/**
 * @fileoverview 对话框外壳的焦点陷阱：可聚焦元素的判定、Tab 首尾回绕与关闭时还焦点（Angular / Vue 端同名 spec 的移植）。
 */

/** 挂一个面板到文档上（焦点断言要求元素在文档里）；面板上的 keydown 交给陷阱，与三端外壳同一接法。 */
const mountPanel = (html: string): HTMLElement => {
  const panel = document.createElement('div');
  panel.tabIndex = -1;
  panel.innerHTML = html;
  panel.addEventListener('keydown', event => trapTabKey(panel, event));
  document.body.append(panel);
  return panel;
};

const byId = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`找不到 #${id}`);
  return element;
};

/** 焦点放到 `element` 上按一下 Tab（`shiftKey` 为 Shift+Tab）；返回事件，看陷阱拦没拦下默认行为。 */
const pressTab = (element: HTMLElement, shiftKey = false): KeyboardEvent => {
  element.focus();
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('tabbableIn', () => {
  it('按文档顺序列出天然可聚焦的控件与写了 tabindex 的元素', () => {
    const panel = mountPanel(`
      <a href="#top" id="link">link</a>
      <a id="anchor">anchor without href</a>
      <button id="button" type="button">button</button>
      <input id="text" />
      <input id="hidden-input" type="hidden" />
      <select id="select"><option>one</option></select>
      <textarea id="textarea"></textarea>
      <div contenteditable="true" id="editable"></div>
      <div contenteditable="false" id="not-editable"></div>
      <div id="region" role="region" tabindex="0"></div>
      <div id="plain">plain</div>
    `);

    expect(tabbableIn(panel).map(element => element.id)).toEqual([
      'link',
      'button',
      'text',
      'select',
      'textarea',
      'editable',
      'region'
    ]);
  });

  it('去掉写了负 tabindex 的、禁用的与看不见的', () => {
    const panel = mountPanel(`
      <button id="kept" type="button">kept</button>
      <button id="negative" tabindex="-1" type="button">negative</button>
      <div id="scripted" tabindex="-1">scripted</div>
      <button disabled id="disabled" type="button">disabled</button>
      <button id="display-none" style="display: none" type="button">display none</button>
      <div style="display: none"><button id="inside-hidden" type="button">inside hidden</button></div>
      <button id="invisible" style="visibility: hidden" type="button">invisible</button>
    `);

    expect(tabbableIn(panel).map(element => element.id)).toEqual(['kept']);
  });
});

describe('trapTabKey', () => {
  const mountButtons = (): HTMLElement =>
    mountPanel(`
      <button id="first" type="button">first</button>
      <button id="middle" type="button">middle</button>
      <button id="last" type="button">last</button>
    `);

  it('Tab 在最后一个可聚焦元素上回到第一个', () => {
    mountButtons();

    expect(pressTab(byId('last')).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId('first'));
  });

  it('Shift+Tab 在第一个或面板本身上去最后一个', () => {
    const panel = mountButtons();

    expect(pressTab(byId('first'), true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId('last'));
    expect(pressTab(panel, true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId('last'));
  });

  it('不在首尾的 Tab 交给浏览器：不拦、不挪焦点', () => {
    const panel = mountButtons();

    expect(pressTab(byId('middle')).defaultPrevented).toBe(false);
    expect(pressTab(byId('middle'), true).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(byId('middle'));
    // 焦点在面板本身时按 Tab：浏览器自己会走到面板里的第一个
    expect(pressTab(panel).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(panel);
  });

  it('面板里没有可聚焦元素：Tab 与 Shift+Tab 都停在面板本身', () => {
    const panel = mountPanel('<p>nothing to focus</p>');

    expect(pressTab(panel).defaultPrevented).toBe(true);
    expect(pressTab(panel, true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(panel);
  });

  it('别的键不管', () => {
    mountButtons();
    const last = byId('last');
    last.focus();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    last.dispatchEvent(enter);

    expect(enter.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(last);
  });
});

describe('restoreFocus', () => {
  it('打开前持有焦点的元素还在文档里：焦点还给它', () => {
    const opener = document.body.appendChild(document.createElement('button'));

    restoreFocus(opener);

    expect(document.activeElement).toBe(opener);
  });

  it('它已不在文档里（打开对话框的菜单已经关了）：不还', () => {
    const opener = document.createElement('button');
    const focus = vi.spyOn(opener, 'focus');

    restoreFocus(opener);

    expect(focus).not.toHaveBeenCalled();
  });
});
