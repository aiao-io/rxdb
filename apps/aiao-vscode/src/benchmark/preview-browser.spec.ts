import { chromium, type Browser, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PreviewEvent } from '../workbench/preview/preview-sandbox.js';
import { frontendTemplates } from '../workbench/templates.js';

describe('真实浏览器编译与 opaque 预览', () => {
  let server: Server;
  let browser: Browser;
  let page: Page;
  let origin: string;
  const privateRequests: string[] = [];
  const navigationCookies: string[] = [];
  const assets = new Map<string, { body: string | Uint8Array; type: string }>();

  beforeAll(async () => {
    const directory = import.meta.dirname;
    const bundle = async (source: string, external: string[] = []) => {
      const result = await build({
        stdin: { contents: source, resolveDir: directory },
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'esm',
        target: 'es2022',
        plugins: [
          {
            name: 'exact-externals',
            setup(api) {
              api.onResolve({ filter: /.*/ }, args =>
                external.includes(args.path) ? { path: args.path, external: true } : undefined
              );
            }
          }
        ],
        define: {
          'process.env.NODE_ENV': '"production"',
          __VUE_OPTIONS_API__: 'true',
          __VUE_PROD_DEVTOOLS__: 'false',
          __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
        }
      });
      return result.outputFiles[0].text;
    };
    assets.set('/main.js', {
      type: 'text/javascript',
      body: await bundle(`import { mountPreview, prepareProjectHTML } from '../workbench/preview/preview-sandbox.ts';
      window.probe = { events: [], dispose: undefined, run(input, imports, extra) {
        this.dispose?.(); const prepared=prepareProjectHTML(input); const worker=new Worker('/compiler.js',{type:'module'});
        return new Promise((resolve,reject)=>{ worker.onmessage=event=>{ worker.terminate(); if(event.data.error){reject(new Error(event.data.error));return;}
          this.events=[]; const options={...event.data.result,html:prepared.html,sessionId:crypto.randomUUID(),projectId:'project',revision:1,imports};
          const mounted=mountPreview(document.getElementById('preview'),options,event=>this.events.push(event)); this.dispose=mounted.dispose;resolve(options);
        }; worker.onerror=reject;worker.postMessage({...input,styles:prepared.styles,inlineCSS:prepared.inlineCSS}); });
      } };`)
    });
    assets.set('/compiler.js', {
      type: 'text/javascript',
      body: await bundle(
        `import {compileInBrowser} from '../workbench/compiler/compiler-browser.ts'; onmessage=async event=>{try{postMessage({result:await compileInBrowser(event.data,{wasmURL:location.origin+'/esbuild.wasm'})})}catch(error){postMessage({error:String(error)})}};`
      )
    });
    const require = createRequire(import.meta.url);
    const reactExports = Object.keys(require('react')).filter(name => name !== 'default');
    const runtimeSources: Record<string, string> = {
      react: `import React from "react";export const {${reactExports.join(',')}} = React;export default React;`,
      'react-dom': 'export {createRoot} from "react-dom/client";',
      'react-jsx': 'export {jsx,jsxs,Fragment} from "react/jsx-runtime";',
      vue: 'export * from "vue";'
    };
    const runtime = await build({
      entryPoints: Object.fromEntries(Object.keys(runtimeSources).map(name => [name, `runtime:${name}`])),
      outdir: '/runtime',
      bundle: true,
      splitting: true,
      write: false,
      platform: 'browser',
      format: 'esm',
      define: {
        'process.env.NODE_ENV': '"production"',
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
      },
      plugins: [
        {
          name: 'runtime-entries',
          setup(api) {
            api.onResolve({ filter: /^runtime:/ }, args => ({
              path: args.path.slice('runtime:'.length),
              namespace: 'runtime-entry'
            }));
            api.onLoad({ filter: /.*/, namespace: 'runtime-entry' }, args => ({
              contents: runtimeSources[args.path],
              resolveDir: directory
            }));
          }
        }
      ]
    });
    for (const file of runtime.outputFiles) assets.set(file.path, { type: 'text/javascript', body: file.text });
    assets.set('/esbuild.wasm', {
      type: 'application/wasm',
      body: await readFile(require.resolve('esbuild-wasm/esbuild.wasm'))
    });
    server = createServer((request, response) => {
      const asset = assets.get(request.url ?? '');
      response.setHeader('Access-Control-Allow-Origin', '*');
      if (request.url === '/') {
        response.setHeader('Content-Type', 'text/html');
        response.setHeader('Set-Cookie', 'ide=private; HttpOnly; SameSite=Lax');
        response.end('<!doctype html><div id="preview"></div><script type="module" src="/main.js"></script>');
        return;
      }
      if (request.url?.startsWith('/private')) {
        privateRequests.push(request.url);
        response.setHeader('Content-Type', 'text/javascript');
        response.end('console.log("HOST_SCRIPT_WAS_EXECUTED")');
        return;
      }
      if (request.url === '/navigation-probe') {
        navigationCookies.push(request.headers.cookie ?? '');
        response.setHeader('Content-Type', 'text/html');
        response.end('<p>已导航</p>');
        return;
      }
      if (!asset) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader('Content-Type', asset.type);
      response.end(asset.body);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('测试服务器没有端口');
    origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    await page.goto(origin);
    await page.waitForFunction('!!window.probe');
  }, 30000);

  afterAll(async () => {
    await browser?.close();
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it.each(['vanilla', 'react', 'vue'] as const)(
    '%s 在真实 Worker 编译后可点击交互与读取图片',
    async template => {
      const fixture = frontendTemplates[template];
      const imports = {
        react: `${origin}/runtime/react.js`,
        'react-dom/client': `${origin}/runtime/react-dom.js`,
        'react/jsx-runtime': `${origin}/runtime/react-jsx.js`,
        vue: `${origin}/runtime/vue.js`
      };
      await page.evaluate(
        ({ fixture, imports }) =>
          (window as unknown as { probe: { run: (fixture: unknown, imports: unknown) => Promise<unknown> } }).probe.run(
            fixture,
            imports
          ),
        { fixture, imports }
      );
      await page.waitForFunction('window.probe.events.some(event => event.type === "ready" || event.type === "error")');
      const failures = await page.evaluate('window.probe.events.filter(event => event.type === "error")');
      expect(failures).toEqual([]);
      const frame = page.frameLocator('iframe');
      await frame.getByRole('button', { name: '次数 0' }).waitFor();
      await frame.getByRole('button').click();
      expect(await frame.getByRole('button').textContent()).toContain('次数 1');
      expect(
        await frame.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
      ).toBe(true);
      await page.waitForFunction(
        'window.probe.events.some(event => event.type === "ready") && window.probe.events.some(event => event.type === "console")'
      );
      expect(await frame.locator('body').evaluate(element => getComputedStyle(element).paddingTop)).toBe('32px');
    },
    30000
  );

  it('预览不能读取父页和 OPFS，也不能把存储遗留给另一个项目', async () => {
    const files = {
      'main.ts': `for (const [name, read] of Object.entries({parent:()=>parent.document.body.innerHTML,storage:()=>localStorage.getItem('project'),database:()=>indexedDB.open('project'),opfs:()=>navigator.storage.getDirectory()})) { try { await read();console.log(name,'ALLOWED'); } catch { console.log(name,'DENIED'); } }`
    };
    await page.evaluate(
      files =>
        (window as unknown as { probe: { run: (fixture: unknown, imports: unknown) => Promise<unknown> } }).probe.run(
          { template: 'vanilla', entry: 'main.ts', files },
          {}
        ),
      files
    );
    await page.waitForFunction('window.probe.events.filter(event => event.type === "console").length === 4');
    const events = await page.evaluate<PreviewEvent[]>('window.probe.events');
    expect(events.filter(event => event.type === 'console').map(event => event.values)).toEqual([
      ['parent', 'DENIED'],
      ['storage', 'DENIED'],
      ['database', 'DENIED'],
      ['opfs', 'DENIED']
    ]);
    expect(await page.locator('iframe').getAttribute('sandbox')).toBe('allow-scripts');
  }, 30000);

  it('交互运行异常回传到当前会话并保留调用栈', async () => {
    const fixture = {
      template: 'vanilla',
      entry: 'main.ts',
      files: {
        'main.ts':
          'document.body.innerHTML="<button>触发错误</button>";document.querySelector("button").onclick=()=>{throw new Error("probe failure")};'
      }
    };
    await page.evaluate(
      fixture =>
        (window as unknown as { probe: { run: (fixture: unknown, imports: unknown) => Promise<unknown> } }).probe.run(
          fixture,
          {}
        ),
      fixture
    );
    await page.frameLocator('iframe').getByRole('button', { name: '触发错误' }).click();
    await page.waitForFunction('window.probe.events.some(event=>event.type==="error")');
    const event = await page.evaluate<Extract<PreviewEvent, { type: 'error' }>>(
      'window.probe.events.find(event=>event.type==="error")'
    );
    expect(event.message).toContain('probe failure');
    expect(event.stack).toContain('blob:');
    expect(event.projectId).toBe('project');
    expect(event.revision).toBe(1);
  }, 30000);

  it('同源的私有脚本、内联样式 URL 与 fetch 均不能越过 runtime 目录权限', async () => {
    const fixture = {
      template: 'vanilla',
      entry: 'main.ts',
      files: {
        'main.ts': `const script=document.createElement('script');script.src=${JSON.stringify(`${origin}/private-script.js`)};document.head.append(script);document.body.innerHTML='<div style="background-image:url(${origin}/private-image)">隔离边界</div>';try{await fetch(${JSON.stringify(`${origin}/private-data`)});}catch{console.log('fetch','DENIED');}`
      }
    };
    await page.evaluate(
      ({ fixture, imports }) =>
        (window as unknown as { probe: { run: (fixture: unknown, imports: unknown) => Promise<unknown> } }).probe.run(
          fixture,
          imports
        ),
      { fixture, imports: { react: `${origin}/runtime/react.js` } }
    );
    await page.waitForFunction('window.probe.events.some(event=>event.type==="ready")');
    expect(privateRequests).toEqual([]);
    expect(
      await page.evaluate(
        'window.probe.events.some(event=>event.type==="console"&&event.values[0]==="HOST_SCRIPT_WAS_EXECUTED")'
      )
    ).toBe(false);
  }, 30000);

  it('预览自身导航使用无宿主凭据的临时上下文', async () => {
    const fixture = {
      template: 'vanilla',
      entry: 'main.ts',
      files: {
        'main.ts': 'import target from "./navigation-target.json";setTimeout(()=>location.replace(target),0);',
        'navigation-target.json': JSON.stringify(`${origin}/navigation-probe`)
      }
    };
    await page.evaluate(
      fixture =>
        (window as unknown as { probe: { run: (fixture: unknown, imports: unknown) => Promise<unknown> } }).probe.run(
          fixture,
          {}
        ),
      fixture
    );
    await expect.poll(() => navigationCookies, { timeout: 5000 }).toEqual(['']);
    expect(navigationCookies).toEqual(['']);
    expect(await page.locator('iframe').getAttribute('credentialless')).toBe('');
  }, 30000);

  it('预览内按工作台快捷键被拦截转发给宿主，页面不会被浏览器关闭', async () => {
    const fixture = {
      template: 'vanilla',
      entry: 'main.ts',
      files: { 'main.ts': 'document.body.innerHTML="<button>在预览内按键</button>";' }
    };
    await page.evaluate(
      fixture =>
        (window as unknown as { probe: { run: (fixture: unknown, imports: unknown) => Promise<unknown> } }).probe.run(
          fixture,
          {}
        ),
      fixture
    );
    await page.waitForFunction('window.probe.events.some(event => event.type === "ready" || event.type === "error")');
    const frame = page.frames().find(candidate => candidate !== page.mainFrame());
    if (!frame) throw new Error('预览 iframe 缺失');
    await frame.getByRole('button', { name: '在预览内按键' }).click();
    await frame.evaluate(() => {
      const records: { key: string; ctrlKey: boolean; shiftKey: boolean; defaultPrevented: boolean }[] = [];
      addEventListener(
        'keydown',
        event =>
          records.push({
            key: event.key,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            defaultPrevented: event.defaultPrevented
          }),
        true
      );
      (window as unknown as { previewKeys: typeof records }).previewKeys = records;
    });
    await page.keyboard.press('Control+Shift+w');
    await page.keyboard.press('Control+w');
    await page.keyboard.press('Control+s');
    await page.keyboard.press('a');
    await page.waitForFunction('window.probe.events.filter(event => event.type === "keydown").length === 2');
    const forwarded = await page.evaluate<Extract<PreviewEvent, { type: 'keydown' }>[]>(
      'window.probe.events.filter(event => event.type === "keydown")'
    );
    expect(forwarded.map(event => event.key)).toEqual(['w', 's']);
    for (const event of forwarded) expect([event.ctrlKey, event.metaKey, event.shiftKey]).toEqual([true, false, false]);
    expect(
      await frame.evaluate(
        'window.previewKeys.filter(record => !["Control","Meta","Shift","Alt"].includes(record.key))'
      )
    ).toEqual([
      { key: 'w', ctrlKey: true, shiftKey: true, defaultPrevented: false },
      { key: 'w', ctrlKey: true, shiftKey: false, defaultPrevented: true },
      { key: 's', ctrlKey: true, shiftKey: false, defaultPrevented: true },
      { key: 'a', ctrlKey: false, shiftKey: false, defaultPrevented: false }
    ]);
    expect(await page.locator('iframe').count()).toBe(1);
  }, 30000);
});
