// vivari 预览容器页入口（独立源的 `/preview-frame.html`）：由 scripts/build-runtime-hosts.mjs 打包。
import { startPreviewFrame } from '../../workbench/terminal/vivari-host.js';

startPreviewFrame(window);
