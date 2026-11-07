// vivari 内核宿主页入口（独立源的 `/`）：由 scripts/build-runtime-hosts.mjs 打包，不进工作台 bundle。
import { Vivari } from '@vivari/core';
import { startVivariHost } from '../../workbench/terminal/vivari-host.js';
import { RUNTIME_HOSTS, hostParents } from '../hosts.js';

startVivariHost(window, {
  parents: hostParents(RUNTIME_HOSTS.vivari, location.origin),
  // 宿主页不发 Document-Isolation-Policy；显式说明，省掉 Service Worker 的 HEAD 探测
  boot: () => Vivari.boot({ serviceWorkerUrl: '/sw.js', documentIsolationPolicy: 'none' })
});
