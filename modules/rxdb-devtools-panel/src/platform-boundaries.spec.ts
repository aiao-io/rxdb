import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const sourceRoot = resolve(import.meta.dirname);

/**
 * 面板源码里**一旦出现就说明抽取失败**的宿主字面量。
 *
 * @remarks
 * 每一条都对应一个具体宿主：写死其中任何一个，面板就只能在那个宿主里跑，
 * US-904 阶段 D（Electron / Tauri 复用同一套 UI）随之落空。
 */
const FORBIDDEN_HOST_TOKENS = [
  'chrome.',
  'browser.runtime',
  'PortService',
  'InspectedPageAccessService',
  'ipcRenderer',
  'contextBridge',
  '__TAURI__',
  '@tauri-apps/',
  'webContents'
];

/** 注释里出现宿主名是**说明**（例如「刻意不依赖 chrome.runtime.Port」），不是依赖。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function collectSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'testing' ? [] : collectSources(path);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) return [];
    return [path];
  });
}

describe('panel platform boundaries', () => {
  const sources = collectSources(sourceRoot);

  it('scans every panel source file', () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it.each(FORBIDDEN_HOST_TOKENS)('keeps %s out of executable panel code', token => {
    const offenders = sources.filter(path => stripComments(readFileSync(path, 'utf8')).includes(token));
    expect(offenders.map(path => relative(sourceRoot, path))).toEqual([]);
  });

  it('reaches the host only through the four injection tokens', () => {
    const transportSource = readFileSync(resolve(sourceRoot, 'transport/index.ts'), 'utf8');
    expect(transportSource).toContain('DEVTOOLS_TRANSPORT');
    expect(transportSource).toContain('DEVTOOLS_HOST_ACCESS');
    expect(transportSource).toContain('DEVTOOLS_FILE_CHANNEL');
    expect(transportSource).toContain('DEVTOOLS_PANEL_VERSION');
  });

  it('never imports from apps/', () => {
    const offenders = sources.filter(path => /from\s+'[^']*\bapps\//.test(readFileSync(path, 'utf8')));
    expect(offenders.map(path => relative(sourceRoot, path))).toEqual([]);
  });
});
