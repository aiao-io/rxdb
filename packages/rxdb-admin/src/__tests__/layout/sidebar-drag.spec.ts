import { describe, expect, it, vi } from 'vitest';
import { SIDEBAR_WIDTH_RANGE, SidebarDrag } from '../../layout/sidebar-drag.js';
import { BUILTIN_PREFERENCE_ITEMS, deriveConstraints } from '../../preferences/schema/index.js';
import { PREFERENCES_STORAGE_KEY, PreferencesStore } from '../../preferences/store.js';
import { createMemoryStorage } from '../../storage.js';

const SLOT_SELECTOR = '.admin-sidebar-slot';
const WIDTH_VAR = '--admin-sidebar-width';

/** 侧栏占位元素的替身：记录样式变量与属性。 */
function createSlot() {
  const style = new Map<string, string>();
  const attributes = new Map<string, string>();
  return {
    style: {
      setProperty: (name: string, value: string): void => void style.set(name, value),
      removeProperty: (name: string): string => {
        const previous = style.get(name) ?? '';
        style.delete(name);
        return previous;
      }
    },
    setAttribute: (name: string, value: string): void => void attributes.set(name, value),
    removeAttribute: (name: string): void => void attributes.delete(name),
    width: (): string | undefined => style.get(WIDTH_VAR),
    resizing: (): string | undefined => attributes.get('data-resizing'),
    writes: (): number => style.size + attributes.size
  };
}

/** 手柄的替身：只会向上找到给定的占位元素。 */
const handleIn = (slot: ReturnType<typeof createSlot> | null): Element =>
  ({ closest: (selector: string) => (selector === SLOT_SELECTOR ? slot : null) }) as unknown as Element;

const setup = (width?: number) => {
  const storage = createMemoryStorage();
  const preferences = new PreferencesStore({
    storage,
    constraints: deriveConstraints(BUILTIN_PREFERENCE_ITEMS, ['light', 'dark'])
  });
  if (width !== undefined) preferences.setPath('sidebar.width', width);
  const slot = createSlot();
  const changes = vi.fn();
  preferences.subscribe(changes);
  return {
    preferences,
    storage,
    slot,
    changes,
    begin: (startX: number) => new SidebarDrag(preferences, handleIn(slot), startX)
  };
};

describe('SIDEBAR_WIDTH_RANGE', () => {
  it('与偏好 sidebar.width 的取值约束一致：拖拽预览与最终提交不会出现跳变', () => {
    const { preferences } = setup();
    preferences.setPath('sidebar.width', 0);
    expect(preferences.value.sidebar.width).toBe(SIDEBAR_WIDTH_RANGE.min);
    preferences.setPath('sidebar.width', 10_000);
    expect(preferences.value.sidebar.width).toBe(SIDEBAR_WIDTH_RANGE.max);
    expect(SIDEBAR_WIDTH_RANGE).toEqual({ min: 160, max: 320 });
  });
});

describe('SidebarDrag', () => {
  it('开始拖动就标记占位元素处于调整中（样式据此关掉宽度过渡），此时还没有预览宽度', () => {
    const { slot, begin } = setup();
    const drag = begin(240);
    expect(slot.resizing()).toBe('true');
    expect(slot.width()).toBeUndefined();
    expect(drag.width).toBe(240);
  });

  it('拖动只预览：宽度写在占位元素的 CSS 变量上，不改偏好、不通知订阅者、不落盘', () => {
    const { preferences, storage, slot, changes, begin } = setup();
    const drag = begin(240);
    expect(drag.move(300)).toBe(300);
    expect(slot.width()).toBe('300px');
    expect(drag.width).toBe(300);
    expect(drag.move(280)).toBe(280);
    expect(slot.width()).toBe('280px');
    preferences.flush();
    expect(preferences.value.sidebar.width).toBe(240);
    expect(changes).not.toHaveBeenCalled();
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  it('宽度以按下时的偏好宽度为起点，按指针位移换算', () => {
    const { slot, begin } = setup(200);
    const drag = begin(100);
    expect(drag.move(150)).toBe(250);
    expect(slot.width()).toBe('250px');
    expect(drag.move(40)).toBe(160);
  });

  it('预览宽度被限制在 160–320', () => {
    const { slot, begin } = setup();
    const drag = begin(240);
    expect(drag.move(900)).toBe(320);
    expect(slot.width()).toBe('320px');
    expect(drag.move(-900)).toBe(160);
    expect(slot.width()).toBe('160px');
  });

  it('松手提交：偏好只更新一次，预览变量与调整中标记一并撤掉', () => {
    const { preferences, storage, slot, changes, begin } = setup();
    const drag = begin(240);
    drag.move(260);
    drag.move(300);
    drag.end();
    expect(preferences.value.sidebar.width).toBe(300);
    expect(changes).toHaveBeenCalledTimes(1);
    expect(slot.width()).toBeUndefined();
    expect(slot.resizing()).toBeUndefined();
    preferences.flush();
    expect(JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY) ?? 'null')).toMatchObject({
      values: { sidebar: { width: 300 } }
    });
  });

  it('没有移动就松手：不提交、不通知，标记照样撤掉', () => {
    const { preferences, slot, changes, begin } = setup();
    const drag = begin(240);
    drag.end();
    expect(preferences.value.sidebar.width).toBe(240);
    expect(changes).not.toHaveBeenCalled();
    expect(slot.resizing()).toBeUndefined();
  });

  it('放弃：撤掉预览与标记，偏好保持拖动前的宽度', () => {
    const { preferences, slot, changes, begin } = setup();
    const drag = begin(240);
    drag.move(300);
    drag.cancel();
    expect(preferences.value.sidebar.width).toBe(240);
    expect(changes).not.toHaveBeenCalled();
    expect(slot.width()).toBeUndefined();
    expect(slot.resizing()).toBeUndefined();
  });

  it('结束后再调用 move / end / cancel 都是空操作（pointerup 与 pointercancel 先后到达也只提交一次）', () => {
    const { preferences, slot, changes, begin } = setup();
    const drag = begin(240);
    drag.move(300);
    drag.end();
    const writes = slot.writes();
    expect(drag.move(260)).toBe(300);
    drag.end();
    drag.cancel();
    expect(slot.writes()).toBe(writes);
    expect(preferences.value.sidebar.width).toBe(300);
    expect(changes).toHaveBeenCalledTimes(1);

    const second = begin(300);
    second.move(250);
    second.cancel();
    second.end();
    expect(preferences.value.sidebar.width).toBe(300);
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('手柄不在侧栏占位元素里时直接报错，不静默忽略', () => {
    const { preferences } = setup();
    expect(() => new SidebarDrag(preferences, handleIn(null), 0)).toThrow(SLOT_SELECTOR);
  });
});
