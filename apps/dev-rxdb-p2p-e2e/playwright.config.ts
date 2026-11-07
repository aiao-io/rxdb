import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';
import { HARNESS_PORT } from './src/browser/harness-api.ts';

const isCI = Boolean(process.env['CI']);

/**
 * US-708 会话层的验收夹具。
 *
 * @remarks
 * - `desktop-tls`：两个独立 Node 进程经真实 TLS socket 建立会话（AC#10）。用例只做编排，不碰 socket，
 *   不启动浏览器。
 * - `browser-webrtc`：同一个 Chromium 里的两个浏览器上下文经真实 WebRTC DataChannel 建立会话（AC#1～#9），
 *   SDP 由用例在两个上下文之间搬运。关掉 mDNS 主机候选、允许回环地址：CI 容器里解析不了 `.local`，
 *   只有一张网卡时也要能连上。
 *
 * 串行：每个用例自己派生一对进程或一对上下文，并行跑会让它们争抢同一台机器的 CPU，失败与真实原因无关。
 */
export default defineConfig({
  ...nxE2EPreset('.', { testDir: './src', openHtmlReport: 'never' }),
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 2 : 0,
  timeout: isCI ? 120000 : 60000,
  expect: {
    timeout: isCI ? 10000 : 5000
  },
  use: {
    trace: { mode: 'retain-on-failure', screenshots: false }
  },
  webServer: {
    command: 'node apps/dev-rxdb-p2p-e2e/src/browser/serve.ts',
    url: `http://127.0.0.1:${HARNESS_PORT}/`,
    reuseExistingServer: false,
    cwd: workspaceRoot,
    timeout: isCI ? 120000 : 60000
  },
  projects: [
    {
      name: 'desktop-tls',
      testMatch: /desktop-tls\.spec\.ts$/
    },
    {
      name: 'browser-webrtc',
      testMatch: /browser-webrtc\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        baseURL: `http://127.0.0.1:${HARNESS_PORT}`,
        launchOptions: {
          args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection']
        }
      }
    }
  ]
});
