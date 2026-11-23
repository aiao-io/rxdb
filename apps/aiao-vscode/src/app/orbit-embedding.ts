import type { OrbitClient, OrbitClientOptions } from '@aiao/orbit/client';
import { connectOrbitClient } from '@aiao/orbit/client';
import { InjectionToken, type Provider } from '@angular/core';
import { isTrustedDesktopOrigin } from '../workbench/git/github/github-desktop-oauth.js';

/** 被 Aiao Desktop 以集成应用嵌入时与桌面的连接；直接访问或被普通 iframe 嵌入时为 undefined。 */
export const ORBIT_CLIENT = new InjectionToken<OrbitClient | undefined>('ORBIT_CLIENT', {
  providedIn: 'root',
  factory: () => undefined
});

/**
 * 先与桌面握手、再启动 Angular（US-410）：被嵌入时 SDK 先移除地址里的内部参数，
 * 不在桌面里时立即得到 undefined，启动流程与原来一样。握手失败不启动，错误交给调用方。
 *
 * 握手只接受受信桌面来源的宿主（{@link isTrustedDesktopOrigin}）：握手令牌取自本应用自己的地址参数，嵌入方自己就能指定，
 * 不设来源准入时任意站点嵌入本应用都能完成握手、扮演桌面。来源不受信的宿主发来的握手被忽略，按握手超时失败。
 */
export async function bootstrapWithOrbit(
  bootstrap: (providers: Provider[]) => Promise<unknown>,
  connect: (options: OrbitClientOptions) => Promise<OrbitClient | undefined> = connectOrbitClient
): Promise<void> {
  const orbit = await connect({ acceptHostOrigin: isTrustedDesktopOrigin });
  await bootstrap([{ provide: ORBIT_CLIENT, useValue: orbit }]);
}
