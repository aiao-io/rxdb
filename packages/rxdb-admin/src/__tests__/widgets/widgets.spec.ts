import { describe, expect, it, vi } from 'vitest';
import { defaultPreferences } from '../../preferences/defaults.js';
import { createMemoryStorage } from '../../storage.js';
import { FullscreenController, type FullscreenDocument } from '../../widgets/fullscreen.js';
import {
  LOCK_PASSWORD_KEY,
  LOCK_STATE_KEY,
  LockController,
  webCryptoHasher,
  type PasswordHasher
} from '../../widgets/lock.js';
import {
  TIMEZONE_REGIONS,
  TIMEZONE_ZONES,
  buildTimezoneEntries,
  cityOf,
  formatInTimezone,
  offsetOf,
  resolveTimezone,
  systemTimezone,
  timeInZone,
  timezoneOptions
} from '../../widgets/timezone.js';
import {
  DEFAULT_WATERMARK_OPTIONS,
  buildWatermarkSvg,
  resolveWatermarkContent,
  watermarkBackground
} from '../../widgets/watermark.js';
import { moveVisibleWidget, toggleWidgetHidden, visibleWidgets } from '../../widgets/widget-order.js';

describe('部件排序', () => {
  const widget = (hidden: string[] = []) => ({
    ...defaultPreferences.widget,
    hidden: hidden as typeof defaultPreferences.widget.hidden
  });

  it('visibleWidgets 过滤隐藏项并保持顺序', () => {
    expect(visibleWidgets(widget(['timezone', 'lock']))).toEqual([
      'search',
      'language',
      'theme',
      'fullscreen',
      'refresh',
      'preferences'
    ]);
  });

  it('moveVisibleWidget 只在可见项内移动，隐藏项留在尾部', () => {
    const next = moveVisibleWidget(widget(['timezone']), 0, 2);
    expect(next.slice(0, 3)).toEqual(['language', 'theme', 'search']);
    expect(next.at(-1)).toBe('timezone');
    expect(next).toHaveLength(defaultPreferences.widget.order.length);
  });

  it('下标越界或不变返回原顺序副本', () => {
    const base = widget();
    expect(moveVisibleWidget(base, 0, 0)).toEqual(base.order);
    expect(moveVisibleWidget(base, -1, 2)).toEqual(base.order);
    expect(moveVisibleWidget(base, 0, 99)).toEqual(base.order);
    expect(moveVisibleWidget(base, 0, 0)).not.toBe(base.order);
  });

  it('toggleWidgetHidden 切换显隐，设置入口不可隐藏', () => {
    expect(toggleWidgetHidden([], 'lock')).toEqual(['lock']);
    expect(toggleWidgetHidden(['lock'], 'lock')).toEqual([]);
    expect(toggleWidgetHidden([], 'preferences')).toEqual([]);
  });
});

describe('水印', () => {
  it('resolveWatermarkContent：显式内容优先，空白回退默认文案', () => {
    expect(resolveWatermarkContent('  机密  ', 'jimmy')).toBe('机密');
    expect(resolveWatermarkContent('   ', ' jimmy ')).toBe('jimmy');
    expect(resolveWatermarkContent('', '')).toBe('');
  });

  it('buildWatermarkSvg 带旋转与透明度，文案经 XML 转义', () => {
    const svg = buildWatermarkSvg(`<a href="x">&'</a>`);
    expect(svg).toContain('&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;');
    expect(svg).toContain(`rotate(${DEFAULT_WATERMARK_OPTIONS.rotate} 120 100)`);
    expect(svg).toContain(`rgba(120,120,120,${DEFAULT_WATERMARK_OPTIONS.alpha})`);
    expect(buildWatermarkSvg('x', { rotate: 0, alpha: 1, width: 10, height: 20 })).toContain('width="10" height="20"');
  });

  it('watermarkBackground 生成 CSS url，空文案返回空串', () => {
    expect(watermarkBackground('机密')).toMatch(/^url\("data:image\/svg\+xml;utf8,/);
    expect(watermarkBackground('')).toBe('');
  });
});

describe('时区', () => {
  const winter = new Date('2026-01-15T00:00:00Z');
  const summer = new Date('2026-07-15T00:00:00Z');

  it('offsetOf 含夏令时与半小时偏移', () => {
    expect(offsetOf('Asia/Shanghai', winter)).toBe('GMT+8');
    expect(offsetOf('UTC', winter)).toBe('GMT');
    expect(offsetOf('America/New_York', winter)).toBe('GMT-5');
    expect(offsetOf('America/New_York', summer)).toBe('GMT-4');
    expect(offsetOf('Asia/Kolkata', winter)).toBe('GMT+5:30');
  });

  it('timeInZone 为 24 小时制，午夜不是 24:00', () => {
    expect(timeInZone('Asia/Shanghai', new Date('2026-01-15T00:00:00Z'))).toBe('08:00');
    expect(timeInZone('UTC', new Date('2026-01-15T00:00:00Z'))).toBe('00:00');
  });

  it('cityOf 取最后一段并还原空格', () => {
    expect(cityOf('Asia/Shanghai')).toBe('Shanghai');
    expect(cityOf('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(cityOf('UTC')).toBe('UTC');
  });

  it('resolveTimezone：空串跟随浏览器时区', () => {
    expect(resolveTimezone('')).toBe(systemTimezone());
    expect(resolveTimezone('Asia/Tokyo')).toBe('Asia/Tokyo');
    expect(systemTimezone()).toMatch(/\S/);
  });

  it('formatInTimezone 按所选时区格式化', () => {
    expect(
      formatInTimezone(winter, 'Asia/Shanghai', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, 'en-GB')
    ).toBe('08:00');
    expect(formatInTimezone(winter, 'UTC')).toMatch(/2026/);
  });

  it('常用时区列表：分组齐全、无重复、条目带偏移', () => {
    const zones = TIMEZONE_ZONES.map(item => item.zone);
    expect(new Set(zones).size).toBe(zones.length);
    expect(new Set(TIMEZONE_ZONES.map(item => item.region))).toEqual(new Set(TIMEZONE_REGIONS));
    const entries = buildTimezoneEntries(winter);
    expect(entries.find(entry => entry.zone === 'Asia/Tokyo')).toEqual({
      zone: 'Asia/Tokyo',
      region: 'asia',
      city: 'Tokyo',
      offset: 'GMT+9'
    });
  });

  it('timezoneOptions：第一项跟随浏览器；当前值不在列表时补一项', () => {
    const options = timezoneOptions('', winter);
    expect(options[0]).toEqual({ value: '', labelKey: 'prefs.option.app.timezone.system' });
    expect(options).toHaveLength(TIMEZONE_ZONES.length + 1);
    expect(options.find(option => option.value === 'Asia/Shanghai')?.label).toBe('Shanghai · GMT+8');
    const custom = timezoneOptions('Asia/Kathmandu', winter);
    expect(custom[1]).toEqual({ value: 'Asia/Kathmandu', label: 'Kathmandu · GMT+5:45' });
    expect(timezoneOptions('Asia/Tokyo', winter)).toHaveLength(TIMEZONE_ZONES.length + 1);
  });
});

describe('FullscreenController', () => {
  const fakeDocument = () => {
    const listeners = new Set<() => void>();
    const doc = {
      fullscreenElement: null as unknown,
      documentElement: {
        requestFullscreen: vi.fn(async () => {
          doc.fullscreenElement = {};
          for (const listener of listeners) listener();
        })
      },
      exitFullscreen: vi.fn(async () => {
        doc.fullscreenElement = null;
        for (const listener of listeners) listener();
      }),
      addEventListener: (_: 'fullscreenchange', listener: () => void) => void listeners.add(listener),
      removeEventListener: (_: 'fullscreenchange', listener: () => void) => void listeners.delete(listener),
      listeners
    };
    return doc satisfies FullscreenDocument & { listeners: Set<() => void> };
  };

  it('toggle 进入与退出全屏，状态随 fullscreenchange 同步', async () => {
    const doc = fakeDocument();
    const controller = new FullscreenController(doc);
    expect(controller.isFullscreen.value).toBe(false);
    await controller.toggle();
    expect(controller.isFullscreen.value).toBe(true);
    await controller.toggle();
    expect(controller.isFullscreen.value).toBe(false);
    expect(doc.exitFullscreen).toHaveBeenCalledOnce();
  });

  it('用户按 Esc 退出（外部触发事件）也能同步', () => {
    const doc = fakeDocument();
    const controller = new FullscreenController(doc);
    doc.fullscreenElement = {};
    for (const listener of doc.listeners) listener();
    expect(controller.isFullscreen.value).toBe(true);
  });

  it('初始已是全屏则读取为 true；destroy 移除监听', () => {
    const doc = fakeDocument();
    doc.fullscreenElement = {};
    const controller = new FullscreenController(doc);
    expect(controller.isFullscreen.value).toBe(true);
    controller.destroy();
    expect(doc.listeners.size).toBe(0);
  });

  it('没有 document（SSR / 测试）时是空操作', async () => {
    const controller = new FullscreenController(undefined);
    await expect(controller.toggle()).resolves.toBeUndefined();
    expect(controller.isFullscreen.value).toBe(false);
    expect(() => controller.destroy()).not.toThrow();
  });
});

describe('LockController', () => {
  const fakeHasher: PasswordHasher = { hash: async (password, salt) => `${salt}:${password}` };
  const create = (extra: Partial<ConstructorParameters<typeof LockController>[0]> = {}) => {
    const storage = createMemoryStorage();
    const listeners = new Set<(event: { key?: string | null }) => void>();
    const host = {
      addEventListener: (_: 'storage', listener: (event: { key?: string | null }) => void) =>
        void listeners.add(listener),
      removeEventListener: (_: 'storage', listener: (event: { key?: string | null }) => void) =>
        void listeners.delete(listener)
    };
    const lock = new LockController({ storage, hasher: fakeHasher, createSalt: () => 'salt', host, ...extra });
    return { lock, storage, listeners, host };
  };

  it('锁定后状态持久化；重建控制器仍是锁定', () => {
    const { lock, storage } = create();
    expect(lock.locked.value).toBe(false);
    lock.lock();
    expect(lock.locked.value).toBe(true);
    expect(storage.getItem(LOCK_STATE_KEY)).toBe('1');
    expect(new LockController({ storage }).locked.value).toBe(true);
  });

  it('setPassword 存加盐哈希并解锁；空密码立即报错', async () => {
    const { lock, storage } = create();
    expect(lock.hasPassword()).toBe(false);
    lock.lock();
    await lock.setPassword('hunter2');
    expect(lock.hasPassword()).toBe(true);
    expect(lock.locked.value).toBe(false);
    expect(JSON.parse(storage.getItem(LOCK_PASSWORD_KEY) ?? '{}')).toEqual({ salt: 'salt', hash: 'salt:hunter2' });
    await expect(lock.setPassword('')).rejects.toThrow(/must not be empty/);
  });

  it('unlockWith：正确解锁，错误保持锁定，未设置密码恒为 false', async () => {
    const { lock } = create();
    await expect(lock.unlockWith('x')).resolves.toBe(false);
    await lock.setPassword('hunter2');
    lock.lock();
    await expect(lock.unlockWith('wrong')).resolves.toBe(false);
    expect(lock.locked.value).toBe(true);
    await expect(lock.unlockWith('hunter2')).resolves.toBe(true);
    expect(lock.locked.value).toBe(false);
  });

  it('损坏的密码记录当作未设置', async () => {
    const { lock, storage } = create();
    storage.setItem(LOCK_PASSWORD_KEY, '{oops');
    await expect(lock.unlockWith('x')).resolves.toBe(false);
    storage.setItem(LOCK_PASSWORD_KEY, JSON.stringify({ salt: 1 }));
    await expect(lock.unlockWith('x')).resolves.toBe(false);
  });

  it('resetPassword 清除密码并解锁', async () => {
    const { lock } = create();
    await lock.setPassword('hunter2');
    lock.lock();
    lock.resetPassword();
    expect(lock.hasPassword()).toBe(false);
    expect(lock.locked.value).toBe(false);
  });

  it('其他标签改动锁定状态时同步；destroy 后不再监听', () => {
    const { lock, storage, listeners } = create();
    storage.setItem(LOCK_STATE_KEY, '1');
    for (const listener of listeners) listener({ key: LOCK_STATE_KEY });
    expect(lock.locked.value).toBe(true);
    storage.removeItem(LOCK_STATE_KEY);
    for (const listener of listeners) listener({ key: null });
    expect(lock.locked.value).toBe(false);
    for (const listener of listeners) listener({ key: 'other' });
    lock.destroy();
    expect(listeners.size).toBe(0);
  });

  it('默认使用随机盐（十六进制 32 位）', async () => {
    const storage = createMemoryStorage();
    const lock = new LockController({ storage, hasher: fakeHasher });
    await lock.setPassword('pw');
    const { salt } = JSON.parse(storage.getItem(LOCK_PASSWORD_KEY) ?? '{}') as { salt: string };
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('webCryptoHasher', () => {
  it('同样的密码与盐得到同样的哈希，不同盐得到不同哈希', async () => {
    const a = await webCryptoHasher.hash('pw', 'aa');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await webCryptoHasher.hash('pw', 'aa')).toBe(a);
    expect(await webCryptoHasher.hash('pw', 'bb')).not.toBe(a);
    expect(await webCryptoHasher.hash('other', 'aa')).not.toBe(a);
  });

  it('环境缺少 Web Crypto 时抛出明确错误而不是退化为弱哈希', async () => {
    vi.stubGlobal('crypto', undefined);
    try {
      await expect(webCryptoHasher.hash('pw', 'aa')).rejects.toThrow(/Web Crypto is unavailable/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
