import { chromium, firefox, webkit } from 'playwright';

/** 冒烟支持的浏览器引擎；chromium 是默认，其他引擎只提供入口（ADESK-US-008，验收归 ADESK-US-005）。 */
export const ENGINES = Object.freeze({ chromium, firefox, webkit });

export const DEFAULT_ENGINE = 'chromium';

export function engineOf(name = DEFAULT_ENGINE) {
  const engine = ENGINES[name];
  if (!engine) throw new Error(`未知的浏览器引擎：${name}（可选：${Object.keys(ENGINES).join('、')}）`);
  return engine;
}

/**
 * 启动指定引擎的浏览器。`channel` 只对 chromium 有意义（例如 `chrome` 用本机安装的 Chrome，有 GPU 加速）。
 *
 * @param {string} name
 * @param {{ headless?: boolean, channel?: string }} [options]
 */
export function launchEngine(name, { headless = true, channel } = {}) {
  return engineOf(name).launch({ headless, ...(channel ? { channel } : {}) });
}
