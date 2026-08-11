import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface TauriConfig {
  app: { security: { csp: string } };
  build: { devUrl: string };
}

interface ProjectConfig {
  targets: {
    serve?: {
      options?: { host?: string };
      configurations?: Record<string, { host?: string }>;
    };
  };
}

const projectRoot = resolve(import.meta.dirname, '../..');
const tauriConfig = JSON.parse(readFileSync(resolve(projectRoot, 'src-tauri/tauri.conf.json'), 'utf8')) as TauriConfig;
const project = JSON.parse(readFileSync(resolve(projectRoot, 'project.json'), 'utf8')) as ProjectConfig;

const directives = new Map(
  tauriConfig.app.security.csp
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [name, ...values] = part.split(/\s+/);
      return [name, values] as const;
    })
);

describe('desktop CSP', () => {
  // `default-src` 不覆盖这四个 —— 缺了它们，注入进来的 `<base>` 能把所有相对
  // 资源重定向到攻击者的源，插件/表单/嵌套框架同理，而 CSP 看上去还很严格。
  it.each([
    ['base-uri', ["'self'"]],
    ['object-src', ["'none'"]],
    ['frame-ancestors', ["'none'"]],
    ['form-action', ["'self'"]]
  ])('pins %s, which default-src does not cover', (name, expected) => {
    expect(directives.get(name)).toEqual(expected);
  });

  // 死授权：本 app 没有启用 `assetProtocol`，`asset:` / `asset.localhost` 是
  // 从模板抄来的、永远用不上的放行。
  it('grants no scheme this app never uses', () => {
    expect(tauriConfig.app.security.csp).not.toContain('asset:');
    expect(tauriConfig.app.security.csp).not.toContain('asset.localhost');
  });

  it('keeps the grants the wa-sqlite runtime does need', () => {
    expect(directives.get('script-src')).toContain("'wasm-unsafe-eval'");
    expect(directives.get('worker-src')).toContain("'self'");
    expect(directives.get('connect-src')).toContain('ipc:');
  });
});

describe('desktop dev server', () => {
  // Tauri 只从 devUrl 取页面，绑 0.0.0.0 等于把带热更新的开发服务器
  // （连同源码 sourcemap）挂到整个局域网上，纯粹是白送的攻击面。
  it('binds to loopback only', () => {
    const serve = project.targets.serve;
    const hosts = [serve?.options?.host, ...Object.values(serve?.configurations ?? {}).map(c => c.host)].filter(
      (host): host is string => typeof host === 'string'
    );

    for (const host of hosts) expect(['localhost', '127.0.0.1']).toContain(host);
    expect(tauriConfig.build.devUrl).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):/);
  });
});
