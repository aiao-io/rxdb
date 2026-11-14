import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EXTERNAL_CONTENT,
  EXTERNAL_CONTENT_NOTICE,
  EXTERNAL_TRIGGERS,
  ExternalContentEntry,
  LINK_ONLY_HOSTS,
  READER_HOST,
  SAFARI_ENTERED_SITES
} from './external-content';

/**
 * web 的源码根（`src/`）。构建会把 `public/` 原样复制进产物，那里的 `saltline.html` 不在 `src/` 里，
 * 不属于这次扫描；它由 `saltline.spec.ts` 守住「自包含、不引用外部脚本样式与媒体」。
 */
const SRC = resolve(import.meta.dirname, '../..');

/** 清单本身不参与扫描：它按主机名登记，不写成 URL，但说明文字里难免带着主机。 */
const REGISTRY = join('app', 'shared', 'external-content.ts');

/** 测试脚手架目录：只被单测引用、不进构建产物，和 `*.spec.ts` 一样不参与扫描。 */
const TESTING_DIR = join('app', 'testing') + sep;

/**
 * 出现在源码里、但不是网络请求目标的主机，每一项写明为什么不会发请求。
 * 这是对账用的噪音名单，不是给用户看的说明，所以放在测试里，不进清单。
 */
const NOT_A_REQUEST: Readonly<Record<string, string>> = {
  'www.w3.org': 'SVG 的 xmlns 命名空间字符串，只是标识符，从不被请求',
  localhost: '种子文本里「打开 http://localhost:3000」的示例，指向用户自己的本机，不是外网',
  'mediawiki.org': '与维基接口返回的错误类型（type 字段）比较用的标识符常量，从不被请求'
};

/** D-04 改成指向清单之前逐一点名的外网主机：清单不能比这份少。要删减得先改 D-04 的结论。 */
const D04_HOSTS = [
  'images.unsplash.com',
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'basemaps.cartocdn.com',
  'nominatim.openstreetmap.org',
  'api.open-meteo.com',
  'r.jina.ai',
  'icons.duckduckgo.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.youtube.com'
];

/**
 * 写成 URL 的外网主机：`http(s)://` 与 `ws(s)://` 之后的主机名，忽略用户名密码与端口。
 * 子域用模板占位的（地图瓦片的 `https://${sub}.basemaps.cartocdn.com`）去掉占位，取固定的那一段。
 */
const URL_HOST = /\b(?:https?|wss?):\/\/(?:[^\s/@'"`<>]+@)?(?:\$\{[^}]*\}\.)?([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)/g;

const hostsIn = (source: string): string[] => [...source.matchAll(URL_HOST)].map(match => match[1].toLowerCase());

const REGISTERED: ReadonlySet<string> = new Set([
  ...EXTERNAL_CONTENT.map(entry => entry.host),
  ...LINK_ONLY_HOSTS.map(entry => entry.host),
  ...Object.keys(NOT_A_REQUEST)
]);

/** 一段源码里没有登记的外网主机（去重、排序）。 */
const unregisteredHosts = (source: string): string[] =>
  [...new Set(hostsIn(source))].filter(host => !REGISTERED.has(host)).sort();

/** `src/` 下参与对账的源码：ts / html / scss，不含单测、测试脚手架与清单自己。返回相对 `src/` 的路径。 */
function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter(
    file =>
      /\.(?:ts|html|scss)$/.test(file) &&
      !file.endsWith('.spec.ts') &&
      !file.startsWith(TESTING_DIR) &&
      file !== REGISTRY
  );
}

const read = (file: string): string => readFileSync(join(SRC, file), 'utf8');

const entryOf = (host: string): ExternalContentEntry => {
  const entry = EXTERNAL_CONTENT.find(item => item.host === host);
  if (!entry) throw new Error(`清单里没有 ${host}`);
  return entry;
};

describe('源码里的外网主机与清单对账', () => {
  it('src 里出现的每个外网主机都登记过：在清单里、在「只是链接」名单里，或明确不是请求', () => {
    const unregistered = sourceFiles().flatMap(file => unregisteredHosts(read(file)).map(host => `${host}（${file}）`));
    expect(unregistered).toEqual([]);
  });

  it('扫描确实读到了源码：登记过的主机在 src 里都有出处，清单里没有陈旧条目', () => {
    const used = new Set(sourceFiles().flatMap(file => hostsIn(read(file))));
    const stale = [...REGISTERED].filter(host => !used.has(host)).sort();
    expect(stale).toEqual([]);
  });

  it('新增一个未登记的主机时单测会失败：对账会把它报出来（自检）', () => {
    const fake = [
      "fetch('https://tracker.example.net/collect?id=1');",
      'const tile = `https://${sub}.cdn.example.org/${z}/${x}.png`;',
      '<img src="http://images.example.com/a.png" alt="" />',
      'const socket = new WebSocket("wss://live.example.io/feed");'
    ].join('\n');
    expect(unregisteredHosts(fake)).toEqual([
      'cdn.example.org',
      'images.example.com',
      'live.example.io',
      'tracker.example.net'
    ]);
  });

  it('已登记的主机与端口、用户名密码、路径的各种写法都认得出，不会误报', () => {
    const fake = [
      `fetch('https://${READER_HOST}/' + url);`,
      'const tile = `https://${sub}.basemaps.cartocdn.com/${z}/${x}/${y}.png`;',
      '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet" />',
      'open http://localhost:3000 and give it a second',
      'xmlns="http://www.w3.org/2000/svg"',
      'const id = `https://${host}/path`; // 主机完全由用户输入决定，没有固定的一段，不在对账范围'
    ].join('\n');
    expect(hostsIn(fake)).toEqual([
      READER_HOST,
      'basemaps.cartocdn.com',
      'fonts.googleapis.com',
      'localhost',
      'www.w3.org'
    ]);
    expect(unregisteredHosts(fake)).toEqual([]);
  });
});

describe('外网内容清单本身', () => {
  it('主机唯一，只写主机名（不含协议、路径与端口），且不与「只是链接」名单重复', () => {
    const hosts = EXTERNAL_CONTENT.map(entry => entry.host);
    expect(new Set(hosts).size).toBe(hosts.length);
    for (const host of [...hosts, ...LINK_ONLY_HOSTS.map(link => link.host)])
      expect(host, `${host} 应当只是主机名`).toMatch(/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/);
    const linkOnly = LINK_ONLY_HOSTS.map(link => link.host);
    expect(new Set(linkOnly).size).toBe(linkOnly.length);
    expect(hosts.filter(host => linkOnly.includes(host))).toEqual([]);
    expect(hosts.filter(host => host in NOT_A_REQUEST)).toEqual([]);
    expect(linkOnly.filter(host => host in NOT_A_REQUEST)).toEqual([]);
  });

  it('每一项的主机、用途、会发送的数据、触发时机与用到它的应用都非空，触发方式取值合法', () => {
    const triggers = Object.keys(EXTERNAL_TRIGGERS);
    for (const entry of EXTERNAL_CONTENT) {
      for (const field of ['host', 'purpose', 'sends', 'when'] as const)
        expect(entry[field].trim(), `${entry.host}.${field}`).not.toBe('');
      expect(triggers, `${entry.host}.trigger`).toContain(entry.trigger);
      expect(entry.apps.length, `${entry.host}.apps`).toBeGreaterThan(0);
      for (const app of entry.apps) expect(app.trim(), `${entry.host}.apps`).not.toBe('');
    }
    for (const link of LINK_ONLY_HOSTS) expect(link.reason.trim(), `${link.host}.reason`).not.toBe('');
    for (const [host, reason] of Object.entries(NOT_A_REQUEST)) expect(reason.trim(), `${host} 的理由`).not.toBe('');
    for (const trigger of Object.values(EXTERNAL_TRIGGERS)) {
      expect(trigger.label.trim()).not.toBe('');
      expect(trigger.meaning.trim()).not.toBe('');
    }
  });

  it('D-04 点名的每个外网主机都在清单里', () => {
    const hosts = EXTERNAL_CONTENT.map(entry => entry.host);
    expect(D04_HOSTS.filter(host => !hosts.includes(host))).toEqual([]);
  });

  it('Safari 阅读模式与地名搜索点名了会发送的内容，且都要用户操作后才请求', () => {
    const reader = entryOf(READER_HOST);
    expect(reader.sends).toMatch(/address you enter/i);
    expect(reader.trigger).toBe('on-action');
    const nominatim = entryOf('nominatim.openstreetmap.org');
    expect(nominatim.sends).toMatch(/search words/i);
    expect(nominatim.trigger).toBe('on-action');
  });

  it('统一写明所有请求至少让第三方看到用户的 IP，也写明了 Safari 里用户输入的站点', () => {
    expect(EXTERNAL_CONTENT_NOTICE.join(' ')).toMatch(/IP address/);
    expect(SAFARI_ENTERED_SITES).toContain(READER_HOST);
  });
});
