import { Orientation, type SerializedDockview } from 'dockview-core';
import { describe, expect, it, vi } from 'vitest';
import {
  createUrlLayoutStore,
  decodeLayoutCode,
  encodeLayoutCode,
  readLayoutCode,
  withLayoutCode,
  type LayoutUrlHost
} from './workbench-layout-url.js';

const layout: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      size: 800,
      data: [{ type: 'leaf', size: 960, data: { id: '1', views: ['editor:src/main.ts'] } }]
    },
    width: 960,
    height: 800,
    orientation: Orientation.HORIZONTAL
  },
  panels: { 'editor:src/main.ts': { id: 'editor:src/main.ts', contentComponent: 'editor' } }
};

/** 只实现存储用到的地址读写；replaceState 按浏览器语义解析相对地址并原地改写。 */
function urlHost(initial: string) {
  let href = initial;
  const replaceState = vi.fn((_state: unknown, _unused: string, url?: string | URL | null) => {
    href = new URL(String(url), href).href;
  });
  const host: LayoutUrlHost = {
    location: {
      get href() {
        return href;
      }
    },
    history: { state: null, replaceState }
  };
  return { host, replaceState, href: () => href };
}

describe('布局码编解码', () => {
  it('布局 JSON 压缩为无填充的 base64url，可原样解回', async () => {
    const json = JSON.stringify(layout);
    const code = await encodeLayoutCode(json);
    expect(code).toMatch(/^[\w-]+$/);
    expect(code.length).toBeLessThan(json.length);
    expect(await decodeLayoutCode(code)).toBe(json);
  });

  it('含多字节字符的布局逐字节往返', async () => {
    const json = JSON.stringify({ title: '资源管理器 · 预览 ✓', path: 'src/页面/主页.ts' });
    expect(await decodeLayoutCode(await encodeLayoutCode(json))).toBe(json);
  });

  it('空码、非法字符、错误长度、非 deflate 数据与超长码都解为 null', async () => {
    for (const code of ['', '%%%not-valid%%%', 'abcde', 'bm90LWRlZmxhdGU', 'A'.repeat(70_000)]) {
      expect(await decodeLayoutCode(code)).toBeNull();
    }
  });

  it('截断的码过不了 zlib 校验，解为 null', async () => {
    const code = await encodeLayoutCode(JSON.stringify(layout));
    expect(await decodeLayoutCode(code.slice(0, -6))).toBeNull();
  });

  it('解压结果超过上限时放弃，挡住压缩炸弹', async () => {
    const bomb = await encodeLayoutCode(`[${'0,'.repeat(600_000)}0]`);
    expect(bomb.length).toBeLessThan(8192);
    expect(await decodeLayoutCode(bomb)).toBeNull();
  });
});

describe('地址栏 hash 中的布局码', () => {
  it('只读写 hash 的 layout 参数，路径、查询与其他 hash 参数保持不变', () => {
    expect(readLayoutCode('https://ide.test/?workbench-verify#layout=abc_-1')).toBe('abc_-1');
    expect(readLayoutCode('https://ide.test/?layout=abc')).toBeNull();
    expect(readLayoutCode('https://ide.test/#theme=dark')).toBeNull();
    expect(withLayoutCode('https://ide.test/app?workbench-verify#theme=dark', 'xyz')).toBe(
      'https://ide.test/app?workbench-verify#theme=dark&layout=xyz'
    );
    expect(withLayoutCode('https://ide.test/#layout=old', 'new')).toBe('https://ide.test/#layout=new');
    expect(withLayoutCode('https://ide.test/?a=1#layout=old', null)).toBe('https://ide.test/?a=1');
  });
});

describe('URL 布局存储', () => {
  it('读出 hash 中的布局；没有布局码、数据损坏或不是 JSON 时为 null', async () => {
    const code = await encodeLayoutCode(JSON.stringify(layout));
    expect(await createUrlLayoutStore(urlHost(`https://ide.test/#layout=${code}`).host).load()).toEqual(layout);
    expect(await createUrlLayoutStore(urlHost('https://ide.test/').host).load()).toBeNull();
    expect(await createUrlLayoutStore(urlHost('https://ide.test/#layout=broken').host).load()).toBeNull();
    const text = await encodeLayoutCode('{not json');
    expect(await createUrlLayoutStore(urlHost(`https://ide.test/#layout=${text}`).host).load()).toBeNull();
  });

  it('保存用 replaceState 改写 hash 并保留查询参数，地址不变时不重复写', async () => {
    const { host, replaceState, href } = urlHost('https://ide.test/?workbench-verify');
    const store = createUrlLayoutStore(host);
    await store.save(layout);
    expect(replaceState).toHaveBeenCalledOnce();
    expect(href()).toMatch(/^https:\/\/ide\.test\/\?workbench-verify#layout=[\w-]+$/);
    expect(await store.load()).toEqual(layout);
    await store.save(layout);
    expect(replaceState).toHaveBeenCalledOnce();
  });

  it('连续保存按调用顺序落地，被后来者取代的布局不写入地址', async () => {
    const { host, replaceState } = urlHost('https://ide.test/');
    const store = createUrlLayoutStore(host);
    const latest: SerializedDockview = { ...layout, activeGroup: '1' };
    await Promise.all([store.save(layout), store.save(latest)]);
    expect(replaceState).toHaveBeenCalledOnce();
    expect(await store.load()).toEqual(latest);
  });

  it('布局码超出上限时从地址移除旧码，刷新不会还原过期布局', async () => {
    const { host, href } = urlHost('https://ide.test/?a=1#layout=old');
    const noise = Buffer.from(crypto.getRandomValues(new Uint8Array(60_000))).toString('base64');
    await createUrlLayoutStore(host).save({ ...layout, activeGroup: noise });
    expect(href()).toBe('https://ide.test/?a=1');
  });
});
