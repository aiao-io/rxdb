import type { DesktopCapability } from '@aiao/orbit/desktop';

import { DesktopAppManifest, grantedCapabilities } from './desktop-apps';

/** 浏览器已知不可用的宿主能力；应用入口持续显示原因，握手与授权同时撤下它。 */
export interface AppCapabilityRestriction {
  readonly capability: DesktopCapability;
  readonly reason: string;
}

/** 当前环境中实际授予的能力及入口处应显示的限制。 */
export interface AppCapabilitySupport {
  readonly capabilities: readonly DesktopCapability[];
  readonly restrictions: readonly AppCapabilityRestriction[];
}

const WEBKIT_CLIPBOARD_READ: AppCapabilityRestriction = {
  capability: 'clipboard:read',
  reason: 'Clipboard reading through Aiao Desktop is disabled: Safari and WebKit block these requests.'
};

/**
 * WebKit 的 MessagePort 剪贴板读取会丢失浏览器认可的手势上下文；本机 Safari 与 WebKit 对照均已复现。
 * 不能通过读取用户剪贴板来探测支持，因此按引擎识别这一个已知限制；浏览器自己的直接读取不受影响。
 */
export function appCapabilitySupport(app: DesktopAppManifest, userAgent = navigator.userAgent): AppCapabilitySupport {
  const capabilities = grantedCapabilities(app);
  const webkit = /AppleWebKit\//.test(userAgent) && !/(?:Chrome|Chromium|Edg|OPR)\//.test(userAgent);
  const restrictions =
    app.kind === 'web' && webkit && capabilities.includes('clipboard:read') ? [WEBKIT_CLIPBOARD_READ] : [];
  const disabled = new Set(restrictions.map(item => item.capability));
  return { capabilities: capabilities.filter(capability => !disabled.has(capability)), restrictions };
}
