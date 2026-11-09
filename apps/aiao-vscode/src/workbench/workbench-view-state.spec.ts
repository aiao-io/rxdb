import { describe, expect, it } from 'vitest';
import { parseWorkbenchViewLayout, type WorkbenchViewState } from './workbench-view-state.js';

const initial: WorkbenchViewState = {
  containerId: 'explorer',
  index: 0,
  size: 300,
  expanded: true,
  visible: true,
  detached: false
};
const defaults = { workspace: initial };
const layout = (state: unknown = initial, dockVisible = true) => ({
  version: 1,
  dockVisible,
  views: { workspace: state }
});

describe('视图布局校验', () => {
  it('旧布局和新增视图使用默认值', () => {
    expect(parseWorkbenchViewLayout(undefined, defaults, {})?.views).toEqual(defaults);
    expect(parseWorkbenchViewLayout({ version: 1, dockVisible: true, views: {} }, defaults, {})?.views).toEqual(
      defaults
    );
  });

  it.each([
    null,
    [],
    { version: 2 },
    { version: 1, dockVisible: 'true', views: {} },
    { version: 1, dockVisible: true, views: { unknown: initial } }
  ])('拒绝非法根结构 %j', value => {
    expect(parseWorkbenchViewLayout(value, defaults, {})).toBeNull();
  });

  it.each([
    { containerId: 'other' },
    { index: -1 },
    { index: 1.5 },
    { size: NaN },
    { size: Infinity },
    { size: 27 },
    { size: 100001 },
    { expanded: 'true' },
    { visible: 1 },
    { detached: null }
  ])('拒绝非法字段 %j', value => {
    expect(parseWorkbenchViewLayout(layout({ ...initial, ...value }), defaults, {})).toBeNull();
  });

  it('拒绝重复归属、丢失的面板和整体隐藏时仍出现的面板', () => {
    expect(parseWorkbenchViewLayout(undefined, defaults, { workspace: {} })).toBeNull();
    expect(parseWorkbenchViewLayout(layout(), defaults, { workspace: {} })).toBeNull();
    const detached = { ...initial, detached: true };
    expect(parseWorkbenchViewLayout(layout(detached), defaults, {})).toBeNull();
    expect(parseWorkbenchViewLayout(layout(detached, false), defaults, { workspace: {} })).toBeNull();
    expect(parseWorkbenchViewLayout(layout(detached), defaults, { workspace: {} })?.views['workspace']).toEqual(
      detached
    );
    expect(parseWorkbenchViewLayout(layout(detached, false), defaults, {})?.views['workspace']).toEqual(detached);
  });
});
