import type { DesktopCapability } from '@aiao/orbit/desktop';
import { describe, expect, it, vi } from 'vitest';

import { testApps } from '../testing/desktop-apps';
import { appCapabilitySupport } from './browser-app-support';
import type { DesktopAppManifest } from './desktop-apps';

const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/27.2 Safari/605.1.15';
const CHROMIUM = 'Mozilla/5.0 AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 Gecko/20100101 Firefox/149.0';

function remote(capabilities: readonly DesktopCapability[] = ['window', 'clipboard:read', 'clipboard:write']): DesktopAppManifest {
  return {
    ...testApps().notes,
    kind: 'web',
    capabilities,
    web: { url: 'https://code.example/', version: 'online', allow: ['clipboard-read', 'clipboard-write'] }
  } as DesktopAppManifest;
}

describe('appCapabilitySupport', () => {
  it.each([CHROMIUM, `${CHROMIUM} Edg/149.0`, FIREFOX])('已验证的其他引擎保留清单全部能力：%s', userAgent => {
    const app = remote();
    expect(appCapabilitySupport(app, userAgent)).toEqual({
      capabilities: ['window', 'clipboard:read', 'clipboard:write'],
      restrictions: []
    });
  });

  it('WebKit 在集成应用握手前撤下读取能力，保留写入与窗口，并给出可见原因的数据', () => {
    const app = remote();
    const support = appCapabilitySupport(app, SAFARI);
    expect(support.capabilities).toEqual(['window', 'clipboard:write']);
    expect(support.restrictions).toEqual([
      { capability: 'clipboard:read', reason: expect.stringMatching(/clipboard reading.*is disabled.*Safari.*WebKit/i) }
    ]);
    expect(app.kind === 'web' && app.capabilities).toEqual(['window', 'clipboard:read', 'clipboard:write']);
  });

  it('不声明读取的应用没有无关的限制提示，空清单仍然默认拒绝', () => {
    expect(appCapabilitySupport(remote(['window']), SAFARI)).toEqual({ capabilities: ['window'], restrictions: [] });
    expect(appCapabilitySupport(remote([]), SAFARI)).toEqual({ capabilities: [], restrictions: [] });
  });

  it('限制只针对集成应用的宿主读取，不撤销内置应用能力，也不给系统入口授予能力', () => {
    const apps = testApps();
    const builtin = { ...apps.notes, capabilities: ['clipboard:read'] } as DesktopAppManifest;
    expect(appCapabilitySupport(builtin, SAFARI)).toEqual({ capabilities: ['clipboard:read'], restrictions: [] });
    expect(appCapabilitySupport(apps.launchpad, SAFARI)).toEqual({ capabilities: [], restrictions: [] });
  });

  it('默认从当前 navigator 识别环境，不尝试读取或探测用户剪贴板', () => {
    const readText = vi.fn();
    vi.stubGlobal('navigator', { userAgent: SAFARI, clipboard: { readText } });
    expect(appCapabilitySupport(remote()).capabilities).not.toContain('clipboard:read');
    expect(readText).not.toHaveBeenCalled();
  });
});
