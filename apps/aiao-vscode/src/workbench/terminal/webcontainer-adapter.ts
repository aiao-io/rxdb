import type { TerminalRuntimeAdapter } from './runtime-adapter.js';

let configuredAPIKey: string | undefined;
let webContainerBootCalled = false;

/** WebContainer 运行时：jsh 提供 pty 与 OSC 状态标记，授权 key 在页面内只能配置一次。 */
export function createWebContainerAdapter(options: { apiKey?: string } = {}): TerminalRuntimeAdapter {
  return {
    id: 'webcontainer',
    capabilities: {
      shell: { command: 'jsh', args: [] },
      markedShell: { command: 'jsh', args: ['--osc'] },
      pty: true
    },
    async boot() {
      if (!globalThis.crossOriginIsolated) throw new Error('终端需要跨源隔离，请配置 COOP / COEP 响应头');
      const api = await import('@webcontainer/api');
      if (options.apiKey && configuredAPIKey !== options.apiKey) {
        if (webContainerBootCalled) throw new Error('WebContainer 授权配置已改变，请刷新页面后重新启动终端');
        api.configureAPIKey(options.apiKey);
        configuredAPIKey = options.apiKey;
      }
      webContainerBootCalled = true;
      return api.WebContainer.boot({ coep: 'require-corp', workdirName: 'project' });
    }
  };
}
