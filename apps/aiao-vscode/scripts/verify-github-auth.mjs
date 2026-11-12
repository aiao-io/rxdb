import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expect } from 'playwright/test';

/**
 * 真实浏览器验收：GitHub 认证与公开仓库打开（US-406 阶段 A）。
 * 前置：应用已运行并带 ?workbench-verify（pnpm nx serve aiao-vscode 后访问即可）。
 * PAT：GITHUB_PAT 环境变量或 --pat=；只在本机脚本与所测应用间传递，不写入报告。
 * 用法：GITHUB_PAT=ghp_... pnpm nx run aiao-vscode:verify-github-auth -- --url=http://localhost:4320/ [--repo=octocat/Hello-World]
 */
const urlArg = process.argv.find(value => value.startsWith('--url='))?.slice('--url='.length);
const baseUrl = (urlArg ?? 'http://localhost:4320/').replace(/\/+$/, '');
const pat =
  process.env.GITHUB_PAT ?? process.argv.find(value => value.startsWith('--pat='))?.slice('--pat='.length) ?? null;
const repoArg =
  process.argv.find(value => value.startsWith('--repo='))?.slice('--repo='.length) ?? 'octocat/Hello-World';
const host = 'vscode';
const appUrl = `${baseUrl}/?workbench-verify`;

const output = join(import.meta.dirname, '../benchmarks');
await mkdir(output, { recursive: true });
const reportPath = join(output, `browser-workbench-github-auth-${host}.json`);
const screenshotPath = join(output, `browser-workbench-github-auth-${host}.png`);
const temporary = await mkdtemp(join(tmpdir(), 'aiao-github-auth-'));
const context = await chromium.launchPersistentContext(join(temporary, 'profile'), {
  headless: true,
  viewport: { width: 1680, height: 1050 }
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
const report = {
  format: 'aiao.browser-workbench.github-auth',
  version: 1,
  host,
  url: baseUrl,
  status: 'failed',
  checks: [],
  login: null,
  repository: repoArg,
  browser: context.browser()?.version(),
  generatedAt: new Date().toISOString()
};
page.on('pageerror', error => errors.push(error.stack ?? error.message));

async function step(name, operation) {
  process.stdout.write(`GitHub auth: ${name}\n`);
  const start = performance.now();
  await operation();
  report.checks.push({ name, milliseconds: Math.round(performance.now() - start) });
}

await step('打开应用并等待 GitHub 服务就绪', async () => {
  await page.goto(appUrl);
  await page.waitForFunction(() => window.github !== undefined, undefined, { timeout: 60000 });
});

await step('登出遗留会话，从干净状态开始', async () => {
  await page.evaluate(async () => {
    await window.github.auth.logout();
  });
  await expect
    .poll(() => page.evaluate(() => window.github.auth.getSession().then(session => session?.login ?? null)))
    .toBe(null);
});

if (!pat) {
  console.error('缺少 GITHUB_PAT：请通过 GITHUB_PAT 环境变量或 --pat= 提供个人访问令牌（仅本机使用，不上报）。');
  report.status = 'skipped';
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await context.close();
  process.exit(0);
}

async function loginViaDialog() {
  await page.locator('[data-welcome-action="github-login"]').click();
  const dialog = page.locator('dialog.wb-github-login');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type=password]').fill(pat);
  await dialog.getByRole('button', { name: '登录', exact: true }).click();
  await expect(dialog.locator('.wb-github-account-name')).not.toHaveText('', { timeout: 30000 });
  const login = (await dialog.locator('.wb-github-account-name').textContent())?.trim();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(dialog).toBeHidden();
  return login;
}

await step('PAT 登录并校验账户（登录对话框 UI）', async () => {
  const login = await loginViaDialog();
  assert.ok(login && typeof login === 'string', '登录对话框没有返回登录名');
  report.login = login;
});

await step('会话跨重载恢复（IndexedDB 密封存储往返）', async () => {
  await page.reload();
  await page.waitForFunction(() => window.github !== undefined);
  const restored = await page.evaluate(() => window.github.auth.getSession().then(session => session?.login ?? null));
  assert.equal(restored, report.login, '重载后会话未恢复');
});

await step('登出清除会话与持久化（登录对话框 UI）', async () => {
  await page.locator('[data-welcome-action="github-login"]').click();
  const dialog = page.locator('dialog.wb-github-login');
  await expect(dialog.locator('.wb-github-account-name')).toBeVisible();
  await dialog.getByRole('button', { name: '登出', exact: true }).click();
  await expect(dialog.locator('input[type=password]')).toBeVisible({ timeout: 30000 });
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.github.auth.getSession().then(session => session?.login ?? null)))
    .toBe(null);
  await page.reload();
  await page.waitForFunction(() => window.github !== undefined);
  await expect
    .poll(() => page.evaluate(() => window.github.auth.getSession().then(session => session?.login ?? null)))
    .toBe(null);
});

await step('再次登录后进入仓库打开流程', async () => {
  const login = await loginViaDialog();
  assert.equal(login, report.login, '再次登录的账户应与首次一致');
});

await step('欢迎视图打开 GitHub 仓库：粘贴 URL 直查并选分支', async () => {
  const button = page.locator('[data-welcome-action="open-github"]');
  await expect(button).toBeVisible();
  await button.click();
  const dialog = page.locator('dialog.wb-github-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('input').fill(repoArg);
  await expect(dialog.locator('.wb-github-item')).toHaveCount(1, { timeout: 30000 });
  await dialog.locator('.wb-github-item').click();
  await expect(dialog.locator('.wb-github-open')).toBeEnabled({ timeout: 30000 });
  await expect(dialog.locator('.wb-github-item').first()).toHaveClass(/wb-github-selected/);
  await dialog.locator('.wb-github-open').click();
  await expect(dialog).toBeHidden();
});

await step('虚拟仓库打开：文件树与 SCM 分支与远端一致', async () => {
  const expected = await page.evaluate(async repository => {
    const [owner, repo] = repository.split('/');
    const info = await window.github.api.getRepository(owner, repo);
    return { owner, repo, defaultBranch: info.defaultBranch };
  }, repoArg);
  await expect(page.locator('.wb-file').first()).toBeVisible({ timeout: 60000 });
  const branchLabel = await page.locator('[data-slot="branch-name"]').textContent();
  assert.equal(branchLabel?.trim(), expected.defaultBranch, `SCM 分支应为 ${expected.defaultBranch}`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
});

await step('项目以 GitHub 标识打开', async () => {
  const history = await page.evaluate(() => window.workbench.session.state.projectId);
  assert.ok(history?.startsWith('github:'), '打开的项目不是 GitHub 项目标识');
});

await step('OAuth 配置状态检查', async () => {
  const state = await page.evaluate(async () => {
    try {
      const request = await window.github.beginOAuth();
      return { ready: true, authorizeUrl: request.authorizeUrl };
    } catch (cause) {
      return { ready: false, message: cause instanceof Error ? cause.message : String(cause) };
    }
  });
  report.oauth = state;
  process.stdout.write(
    `GitHub auth: OAuth ${state.ready ? '已配置（authorizeUrl 可生成）' : `未配置：${state.message}`}\n`
  );
});

if (errors.length) {
  report.errors = errors;
  throw new Error(`页面捕获到未处理错误：\n${errors.join('\n')}`);
}
report.status = 'passed';
await writeFile(reportPath, JSON.stringify(report, null, 2));
await context.close();
console.log(`\n通过：${report.checks.length} 步；报告 ${reportPath}`);
