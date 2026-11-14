import { a11y } from './a11y.mjs';
import { appLifecycle } from './app-lifecycle.mjs';
import { applicationsProtection } from './applications-protection.mjs';
import { applicationsUpgrade } from './applications-upgrade.mjs';
import { applications } from './applications.mjs';
import { apps } from './apps.mjs';
import { diskTerminal } from './disk-terminal.mjs';
import { dock } from './dock.mjs';
import { externalContent } from './external-content.mjs';
import { fixtures } from './fixtures.mjs';
import { game } from './game.mjs';
import { hostCapabilities } from './host-capabilities.mjs';
import { hostFilesystem } from './host-filesystem.mjs';
import { integratedApp } from './integrated-app.mjs';
import { lazyLoading } from './lazy-loading.mjs';
import { multiTabStartup } from './multi-tab-startup.mjs';
import { multiTab } from './multi-tab.mjs';
import { narrowScreen } from './narrow-screen.mjs';
import { persistence } from './persistence.mjs';
import { shellInteraction } from './shell-interaction.mjs';
import { shell } from './shell.mjs';
import { transparentWindow } from './transparent-window.mjs';
import { upgradeLegacy } from './upgrade-legacy.mjs';
import { upgradePrevious } from './upgrade-previous.mjs';
import { upgradeProtection } from './upgrade-protection.mjs';
import { windowLayout } from './window-layout.mjs';

/**
 * 全部检查组（ADESK-US-008）。每组独立运行、独立的浏览器上下文，用 `weight` 提示相对耗时
 * （并行时耗时长的先开始）；`exclusive` 的组独占运行（真游戏的软件 WebGL 很吃 CPU，不和别的组同时跑）；
 * `default: false` 的组不随全量冒烟运行。
 *
 * 新增检查组：在 `groups/` 下加一个文件，导出 `{ name, description, keys, run(session) }`，登记在这里。
 */
export const GROUPS = [
  { ...shell, weight: 20 },
  { ...shellInteraction, weight: 40 },
  { ...diskTerminal, weight: 30 },
  { ...integratedApp, weight: 25 },
  { ...transparentWindow, weight: 12 },
  { ...game, weight: 60, exclusive: true },
  { ...apps, weight: 15 },
  { ...dock, weight: 25 },
  { ...persistence, weight: 30 },
  { ...multiTab, weight: 90, exclusive: true },
  { ...multiTabStartup, weight: 45 },
  { ...narrowScreen, weight: 20 },
  { ...applications, weight: 30 },
  { ...applicationsProtection, weight: 50 },
  { ...applicationsUpgrade, weight: 50 },
  { ...externalContent, weight: 8 },
  { ...lazyLoading, weight: 25 },
  { ...appLifecycle, weight: 30 },
  { ...hostCapabilities, weight: 45 },
  { ...hostFilesystem, weight: 60 },
  { ...windowLayout, weight: 70 },
  { ...a11y, weight: 60 },
  { ...upgradeLegacy, weight: 35 },
  { ...upgradeProtection, weight: 30 },
  { ...upgradePrevious, weight: 20 },
  { ...fixtures, weight: 40, exclusive: true }
];
