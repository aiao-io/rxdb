import type { RuntimeCapabilities, RuntimeId, TerminalRuntimeAdapter } from './runtime-adapter.js';
import { openRuntimeHost } from './runtime-host-frame.js';

/**
 * 跑在独立源宿主页里的运行方式与它们的终端能力。两者都没有伪终端：项目运行走进程模式，
 * Ctrl+C 由运行时回显并结束前台进程。交互 Shell 都是无参 `sh`——vivari 自带的 sh 自己处理行编辑，
 * Nodepod 的宿主后端把它接到 NodepodTerminal 上。
 */
const HOSTED_CAPABILITIES = {
  vivari: { shell: { command: 'sh', args: [] }, pty: false },
  nodepod: { shell: { command: 'sh', args: [] }, pty: false }
} as const satisfies Readonly<Partial<Record<RuntimeId, RuntimeCapabilities>>>;

/** 跑在独立源宿主页里的运行方式。 */
export type HostedRuntimeId = keyof typeof HOSTED_CAPABILITIES;

export const isHostedRuntime = (id: string): id is HostedRuntimeId => Object.hasOwn(HOSTED_CAPABILITIES, id);

/**
 * 独立源宿主里的运行时：宿主页独占一个源（Worker 资源与预览 Service Worker 都挂在源根），
 * 工作台以隐藏 iframe 加载它并经私有端口驱动。宿主源只来自部署配置。
 */
export function createHostedRuntimeAdapter(id: HostedRuntimeId, hostOrigin: string): TerminalRuntimeAdapter {
  return {
    id,
    capabilities: HOSTED_CAPABILITIES[id],
    async boot() {
      if (!globalThis.crossOriginIsolated) throw new Error('终端需要跨源隔离，请配置 COOP / COEP 响应头');
      const host = await openRuntimeHost(document, { origin: hostOrigin, runtime: id });
      try {
        await host.boot();
      } catch (cause) {
        host.teardown();
        throw cause;
      }
      return host;
    }
  };
}
