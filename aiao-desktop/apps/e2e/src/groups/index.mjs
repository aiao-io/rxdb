import { apps } from './apps.mjs';
import { diskTerminal } from './disk-terminal.mjs';
import { fixtures } from './fixtures.mjs';
import { game } from './game.mjs';
import { integratedApp } from './integrated-app.mjs';
import { persistence } from './persistence.mjs';
import { shell } from './shell.mjs';
import { transparentWindow } from './transparent-window.mjs';

/**
 * 全部检查组（ADESK-US-008）。每组独立运行、独立的浏览器上下文，用 `weight` 提示相对耗时
 * （并行时耗时长的先开始）；`default: false` 的组不随全量冒烟运行。
 *
 * 新增检查组：在 `groups/` 下加一个文件，导出 `{ name, description, keys, run(session) }`，登记在这里。
 */
export const GROUPS = [
  { ...shell, weight: 20 },
  { ...diskTerminal, weight: 30 },
  { ...integratedApp, weight: 25 },
  { ...transparentWindow, weight: 12 },
  { ...game, weight: 60 },
  { ...apps, weight: 15 },
  { ...persistence, weight: 30 },
  { ...fixtures, weight: 40 }
];
