import { createOrbit } from '@aiao/orbit';
import { DestroyRef, Service, inject } from '@angular/core';

import { isWindowFailure } from '../apps/web-app/web-app-failure';
import { DESKTOP_APPS, webAppOrigins } from './desktop-apps';

/**
 * 桌面页的 Orbit 运行内核（D-11）：只放行登记表里集成应用入口的精确来源，
 * 每个集成应用窗口在它上面登记一个实例，桌面页销毁时一并释放。
 */
@Service({ autoProvided: false })
export class OrbitHost {
  /** 各窗口自己显示启动与运行中的失败；其余错误（处理函数、协议）照常上报到控制台。 */
  readonly runtime = createOrbit({
    allowedOrigins: webAppOrigins(inject(DESKTOP_APPS)),
    onError: error => {
      if (!isWindowFailure(error)) console.error(error);
    }
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.runtime.dispose());
  }
}
