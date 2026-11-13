import type { OrbitClient } from '@aiao/orbit/client';
import { connectOrbitClient } from '@aiao/orbit/client';
import { InjectionToken, type Provider } from '@angular/core';

/** 被 Aiao Desktop 以集成应用嵌入时与桌面的连接；直接访问或被普通 iframe 嵌入时为 undefined。 */
export const ORBIT_CLIENT = new InjectionToken<OrbitClient | undefined>('ORBIT_CLIENT', {
  providedIn: 'root',
  factory: () => undefined
});

/**
 * 先与桌面握手、再启动 Angular（US-410）：被嵌入时 SDK 先移除地址里的内部参数，
 * 不在桌面里时立即得到 undefined，启动流程与原来一样。握手失败不启动，错误交给调用方。
 */
export async function bootstrapWithOrbit(
  bootstrap: (providers: Provider[]) => Promise<unknown>,
  connect: () => Promise<OrbitClient | undefined> = connectOrbitClient
): Promise<void> {
  const orbit = await connect();
  await bootstrap([{ provide: ORBIT_CLIENT, useValue: orbit }]);
}
