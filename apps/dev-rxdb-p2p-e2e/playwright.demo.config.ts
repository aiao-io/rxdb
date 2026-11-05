import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';
import { ADMIN_ACCOUNT, DEMO_PORT } from './src/demo/fixtures.ts';

const isCI = Boolean(process.env['CI']);

/**
 * US-707 阶段 A 浏览器半边：dev-rxdb-p2p 的构建产物经 wrangler 起 Worker（与 Cloudflare 同构），
 * 认证与清单同步走真实的 Supabase 栈（CI 由 supabase action 起，本地起隔离栈）。
 *
 * @remarks
 * 两个浏览器上下文模拟两台设备：各自的 localStorage / OPFS 相互隔离，经真实信令与 WebRTC DataChannel 互传。
 * 启动参数同 US-708 夹具：关掉 mDNS 主机候选、允许回环地址（CI 容器里解析不了 `.local`）。
 * 串行：每个用例自己开两三个上下文，并行会让它们争抢同一台机器。
 */
export default defineConfig({
  ...nxE2EPreset('.', { testDir: './src/demo', openHtmlReport: 'never' }),
  // 邀请制门禁只在 POOL_REQUIRE_ACTIVATION=true 的独立运行里执行（tmp/e2e 的 gated 配置）
  testIgnore: [/governance-gated\.spec\.ts/, /governance-limits\.spec\.ts/],
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 2 : 0,
  timeout: isCI ? 180_000 : 90_000,
  expect: { timeout: isCI ? 20_000 : 10_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${DEMO_PORT}`,
    trace: { mode: 'retain-on-failure', screenshots: true },
    launchOptions: {
      args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection']
    }
  },
  webServer: {
    command: 'bash apps/dev-rxdb-p2p/scripts/e2e-serve.sh',
    url: `http://127.0.0.1:${DEMO_PORT}/app-config.js`,
    env: {
      P2P_E2E_PORT: String(DEMO_PORT),
      // 管理后台的验收：管理员账号在 Worker 启动前建好，名单里只有它（见 scripts/e2e-admin-user.mjs、e2e-serve.sh）
      P2P_E2E_ADMIN_EMAIL: ADMIN_ACCOUNT.email,
      P2P_E2E_ADMIN_PASSWORD: ADMIN_ACCOUNT.password
    },
    reuseExistingServer: false,
    cwd: workspaceRoot,
    timeout: isCI ? 240_000 : 180_000
  }
});
