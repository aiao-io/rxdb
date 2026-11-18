import { a11y } from './a11y.mjs';
import { aiaoCodeFiles } from './aiao-code-files.mjs';
import { appLifecycle } from './app-lifecycle.mjs';
import { applicationsProtection } from './applications-protection.mjs';
import { applicationsUpgrade } from './applications-upgrade.mjs';
import { applications } from './applications.mjs';
import { approvedCatalog } from './approved-catalog.mjs';
import { apps } from './apps.mjs';
import { backupStorage } from './backup-storage.mjs';
import { calendarDrafts } from './calendar-drafts.mjs';
import { contacts } from './contacts.mjs';
import { contentActions } from './content-actions.mjs';
import { diskTerminal } from './disk-terminal.mjs';
import { dock } from './dock.mjs';
import { documentWorkflow } from './document-workflow.mjs';
import { externalContent } from './external-content.mjs';
import { fileManagement } from './file-management.mjs';
import { fixtures } from './fixtures.mjs';
import { fontbookWorkflow } from './fontbook-workflow.mjs';
import { freeformWorkflow } from './freeform-workflow.mjs';
import { game } from './game.mjs';
import { hostCapabilities } from './host-capabilities.mjs';
import { hostFilesystem } from './host-filesystem.mjs';
import { integratedApp } from './integrated-app.mjs';
import { lazyLoading } from './lazy-loading.mjs';
import { localMail } from './local-mail.mjs';
import { localMessages } from './local-messages.mjs';
import { multiTabStartup } from './multi-tab-startup.mjs';
import { multiTab } from './multi-tab.mjs';
import { narrowScreen } from './narrow-screen.mjs';
import { noteDrafts } from './note-drafts.mjs';
import { notesActions } from './notes-actions.mjs';
import { notesFolders } from './notes-folders.mjs';
import { offlineResources } from './offline-resources.mjs';
import { persistence } from './persistence.mjs';
import { pwa } from './pwa.mjs';
import { reminderDrafts } from './reminder-drafts.mjs';
import { reminderFilters } from './reminder-filters.mjs';
import { runtimeActivity } from './runtime-activity.mjs';
import { settingsWorkflow } from './settings-workflow.mjs';
import { shellInteraction } from './shell-interaction.mjs';
import { shell } from './shell.mjs';
import { stocksWorkflow } from './stocks-workflow.mjs';
import { storageFaults } from './storage-faults.mjs';
import { terminalPackages } from './terminal-packages.mjs';
import { terminalRuntimes } from './terminal-runtimes.mjs';
import { transparentWindow } from './transparent-window.mjs';
import { upgradeLegacy } from './upgrade-legacy.mjs';
import { upgradePrevious } from './upgrade-previous.mjs';
import { upgradeProtection } from './upgrade-protection.mjs';
import { windowLayout } from './window-layout.mjs';

/**
 * 全部检查组（ADESK-US-008）。每组独立运行、独立的浏览器上下文，用 `weight` 提示相对耗时
 * （并行时耗时长的先开始）；`exclusive` 的组独占运行（真游戏的软件 WebGL 很吃 CPU，不和别的组同时跑）；
 * `default: false` 的组不随全量冒烟运行；`engines` 限定有专用浏览器接口的检查组。
 *
 * 新增检查组：在 `groups/` 下加一个文件，导出 `{ name, description, keys, run(session, server) }`，登记在这里；server 可用于同源切换构建产物。
 */
export const GROUPS = [
  { ...calendarDrafts, weight: 40 },
  { ...localMail, weight: 45 },
  { ...localMessages, weight: 40 },
  { ...noteDrafts, weight: 40 },
  { ...notesActions, weight: 20 },
  { ...notesFolders, weight: 20 },
  { ...reminderDrafts, weight: 35 },
  { ...reminderFilters, weight: 25 },
  { ...contentActions, engines: ['chromium'], weight: 25 },
  { ...contacts, weight: 25 },
  { ...aiaoCodeFiles, default: false, engines: ['chromium'], exclusive: true, weight: 80 },
  { ...offlineResources, weight: 35 },
  { ...runtimeActivity, weight: 30 },
  { ...approvedCatalog, weight: 60 },
  { ...storageFaults, weight: 80 },
  { ...backupStorage, weight: 40 },
  { ...fileManagement, weight: 35 },
  { ...documentWorkflow, weight: 30 },
  { ...shell, weight: 20 },
  { ...shellInteraction, weight: 40 },
  { ...diskTerminal, weight: 30 },
  { ...terminalPackages, weight: 30 },
  { ...terminalRuntimes, weight: 90, exclusive: true },
  { ...integratedApp, weight: 25 },
  { ...transparentWindow, weight: 12 },
  { ...game, weight: 60, exclusive: true },
  { ...apps, weight: 15 },
  { ...dock, weight: 25 },
  { ...persistence, weight: 30 },
  { ...pwa, weight: 60 },
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
  { ...freeformWorkflow, weight: 30 },
  { ...fontbookWorkflow, weight: 20 },
  { ...stocksWorkflow, weight: 25 },
  { ...settingsWorkflow, weight: 20 },
  { ...fixtures, weight: 40, exclusive: true }
];
