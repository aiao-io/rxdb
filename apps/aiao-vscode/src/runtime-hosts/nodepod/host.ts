// Nodepod 宿主页入口（独立源的 `/`）：由 scripts/build-runtime-hosts.mjs 打包，不进工作台 bundle。
// Nodepod 是 MIT + Commons Clause，仅内部评估（US-409）。
import { Nodepod } from '@r1ck404/nodepod';
import { startNodepodHost } from '../../workbench/terminal/nodepod-host.js';
import { RUNTIME_HOST_PAGE } from '../../workbench/terminal/runtime-host-frame.js';
import { RUNTIME_HOSTS, hostParents } from '../hosts.js';

startNodepodHost(window, {
  parents: hostParents(RUNTIME_HOSTS.nodepod, location.origin),
  boot: onServerReady =>
    Nodepod.boot({
      workdir: '/project',
      swUrl: '/__sw__.js',
      // 预览走宿主源上的路径（`/__virtual__/…`），不用 `{实例}-{端口}.localhost` 子域
      previewOrigin: false,
      // 预览占用 `/` 时也不能截走宿主页自己；只写精确路径（以 `/` 结尾的条目按前缀匹配）。
      // 宿主页加载的脚本由保留文档发起，SW 按引用页放行
      reservedHostPaths: [RUNTIME_HOST_PAGE],
      onServerReady
    })
});
