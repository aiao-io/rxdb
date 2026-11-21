import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { FakeDom, configureServices } from '../testing/angular';
import { FakeMediaQuery, stubMatchMedia } from '../testing/browser';
import { SystemState } from './system-state';
import { ACCENTS, ACCENT_KEYS, ThemeService, accentHex } from './theme';

interface Harness {
  readonly theme: ThemeService;
  readonly system: SystemState;
  readonly dom: FakeDom;
  readonly media: FakeMediaQuery;
}

/** 创建主题服务并让构造时登记的 effect 先跑一遍。 */
function setup(hostIsDark = false): Harness {
  const media = new FakeMediaQuery(hostIsDark);
  stubMatchMedia(media);
  const dom = configureServices([SystemState, ThemeService]);
  const theme = TestBed.inject(ThemeService);
  const system = TestBed.inject(SystemState);
  TestBed.tick();
  return { theme, system, dom, media };
}

const painted = (dom: FakeDom, name: string): string | undefined => dom.root.style.values.get(name);

describe('强调色表', () => {
  it('列出九种强调色，Multicolour 没有色值，其余在深色下可以另有色值', () => {
    expect(ACCENT_KEYS).toEqual(Object.keys(ACCENTS));
    expect(ACCENT_KEYS).toHaveLength(9);
    expect(accentHex(ACCENTS.multi, 'light')).toBeNull();
    expect(accentHex(ACCENTS.blue, 'light')).toBe('#0a7cff');
    expect(accentHex(ACCENTS.blue, 'dark')).toBe('#0a84ff');
  });

  it('深色色值缺省时沿用浅色色值', () => {
    expect(accentHex({ name: 'Plain', hex: '#123456' }, 'dark')).toBe('#123456');
  });
});

describe('ThemeService 外观', () => {
  it('启动时把当前主题写到根元素的 data-theme，并带上侧栏图标与滚动条策略', () => {
    const { dom } = setup();
    expect(dom.root.dataset).toMatchObject({ theme: 'light', sbIcons: 'medium', bars: 'auto' });
  });

  it('setAppearance 选定浅色或深色：主题和外观一起改，并刷新根元素', () => {
    const { theme, system, dom } = setup();
    theme.setAppearance('dark');
    TestBed.tick();
    expect(system.appearance()).toBe('dark');
    expect(system.theme()).toBe('dark');
    expect(dom.root.dataset['theme']).toBe('dark');
  });

  it('auto 跟随宿主系统：宿主是深色就用深色，宿主切换时跟着变', () => {
    const { theme, system, media } = setup(true);
    theme.setAppearance('auto');
    expect(system.appearance()).toBe('auto');
    expect(system.theme()).toBe('dark');

    media.emit(false);
    expect(system.theme()).toBe('light');
    media.emit(true);
    expect(system.theme()).toBe('dark');
  });

  it('用户选定一边之后，宿主系统的变化不再影响主题', () => {
    const { theme, system, media } = setup();
    theme.setAppearance('auto');
    theme.setAppearance('light');
    media.emit(true);
    expect(system.theme()).toBe('light');
  });

  it('toggle 在浅色与深色之间来回切', () => {
    const { theme, system } = setup();
    theme.toggle();
    expect(system.theme()).toBe('dark');
    theme.toggle();
    expect(system.theme()).toBe('light');
    expect(system.appearance()).toBe('light');
  });

  it('宿主销毁后撤掉对系统外观的监听', () => {
    const { media } = setup();
    expect(media.listeners.size).toBe(1);
    TestBed.resetTestingModule();
    expect(media.listeners.size).toBe(0);
  });

  it('侧栏图标尺寸与滚动条策略变化时写到根元素', () => {
    const { system, dom } = setup();
    system.sidebarIcons.set('large');
    system.scrollbars.set('always');
    TestBed.tick();
    expect(dom.root.dataset).toMatchObject({ sbIcons: 'large', bars: 'always' });
  });
});

describe('ThemeService 强调色与选中高亮', () => {
  it('多彩（默认）不覆盖 --blue 等变量', () => {
    const { dom } = setup();
    expect(painted(dom, '--blue')).toBeUndefined();
    expect(painted(dom, '--blue-press')).toBeUndefined();
    expect(painted(dom, '--on-accent')).toBeUndefined();
  });

  it('选一种强调色：写 --blue、更深的按下色，以及按亮度决定的前景色', () => {
    const { theme, dom } = setup();
    theme.setAccent('blue');
    TestBed.tick();
    expect(painted(dom, '--blue')).toBe('#0a7cff');
    expect(painted(dom, '--blue-press')).toBe('#0053d6');
    expect(painted(dom, '--on-accent')).toBe('#fff');

    theme.setAccent('yellow');
    TestBed.tick();
    expect(painted(dom, '--blue')).toBe('#f7ce46');
    expect(painted(dom, '--on-accent')).toBe('#1d1d1f');
  });

  it('深色主题下改用强调色的深色色值', () => {
    const { theme, dom } = setup();
    theme.setAccent('blue');
    theme.setAppearance('dark');
    TestBed.tick();
    expect(painted(dom, '--blue')).toBe('#0a84ff');
  });

  it('换回多彩时撤掉之前写的变量', () => {
    const { theme, dom } = setup();
    theme.setAccent('red');
    TestBed.tick();
    expect(painted(dom, '--blue')).toBe('#e0383e');

    theme.setAccent('multi');
    TestBed.tick();
    expect(painted(dom, '--blue')).toBeUndefined();
    expect(painted(dom, '--blue-press')).toBeUndefined();
    expect(painted(dom, '--on-accent')).toBeUndefined();
  });

  it('选中高亮：指定颜色时写 --sel，「跟随强调色」时撤掉', () => {
    const { theme, dom } = setup();
    theme.setHighlight('green');
    TestBed.tick();
    expect(painted(dom, '--sel')).toBe('#62ba46');

    theme.setHighlight('accent');
    TestBed.tick();
    expect(painted(dom, '--sel')).toBeUndefined();
  });
});
