import { LEGACY_RUNTIME_SCRIPTS } from './runtime-scripts';

const RUNTIME_EXPORTS = `
window.WM = WM;
window.APPS = APPS;
window.Pop = Pop;
window.Dock = Dock;
window.MenuBar = MenuBar;
window.Theme = Theme;
window.SYS = SYS;
window.Wall = Wall;
window.Screen = Screen;
window.Desktop = Desktop;
window.Launchpad = Launchpad;
window.Spotlight = Spotlight;
window.NotifCenter = NotifCenter;
window.Startup = Startup;
window.__AIAO_DESKTOP_RUNTIME_LOADED__ = true;
`;

let runtimeStarted = false;

export function startLegacyRuntime(): void {
  if (runtimeStarted || window.__AIAO_DESKTOP_RUNTIME_LOADED__) {
    return;
  }

  runtimeStarted = true;
  const source = [...LEGACY_RUNTIME_SCRIPTS, RUNTIME_EXPORTS].join('\n');
  new Function(source)();
}
