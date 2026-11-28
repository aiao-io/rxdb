import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import { switchIdentity } from './identity';
import { openSidePanel, pull } from './workbench';

/**
 * 演示租户与它的管理员（US-234）：Alice 管星河零售，Bob 管极光百货。
 *
 * @remarks
 * 演示账号第一次登录时加入为它登记的租户，由服务端授予管理员；用例不改这两位自己的权限。
 */
const TENANT_ADMINS = {
  xinghe: { choice: 'alice', title: 'Alice', name: '星河零售' },
  jiguang: { choice: 'bob', title: 'Bob', name: '极光百货' }
} as const;

/** 演示租户的 id */
export type DemoTenantId = keyof typeof TENANT_ADMINS;

/** 一位成员在「成员与权限」里能被设成的角色 */
export type MemberRole = '管理员' | '员工';

/**
 * 当前身份的用户 id：商品页「身份与权限」里的那一行
 *
 * @param page - 商品页
 */
export function userIdOf(page: Page): Promise<string> {
  return page.getByTestId('catalog-user-id').innerText();
}

/**
 * 「成员与权限」里一个租户下的一位成员
 *
 * @param drawer - 打开着的「模拟服务端变更」
 * @param tenantId - 租户
 * @param userId - 成员的用户 id
 */
export function memberRow(drawer: Locator, tenantId: DemoTenantId, userId: string): Locator {
  return drawer.locator(
    `[data-testid="tenant-members"][data-tenant-id="${tenantId}"] [data-testid="tenant-member"][data-user-id="${userId}"]`
  );
}

/**
 * 在「成员与权限」里把一位成员设为管理员或员工，等服务端改完、按钮按下
 *
 * @param drawer - 管理员打开着的「模拟服务端变更」
 * @param tenantId - 租户
 * @param userId - 成员的用户 id
 * @param role - 设成什么
 */
export async function setRole(
  drawer: Locator,
  tenantId: DemoTenantId,
  userId: string,
  role: MemberRole
): Promise<void> {
  const button = memberRow(drawer, tenantId, userId).getByRole('button', { name: role, exact: true });
  await expect(button).toBeVisible({ timeout: 30_000 });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
}

/**
 * 在另一个浏览器上下文里以租户的管理员打开商品页与「模拟服务端变更」，在面板里做完 `run` 再关掉这个上下文
 *
 * @param browser - 浏览器
 * @param base - 用来算地址的页面
 * @param tenantId - 租户；它的管理员见 {@link TENANT_ADMINS}
 * @param run - 拿着管理员打开着的面板要做的事
 *
 * @remarks
 * 打开、登录与 `run` 任一步失败都会关上下文，不在 worker 里留下登录着的管理员页面。
 */
export async function withTenantAdmin(
  browser: Browser,
  base: Page,
  tenantId: DemoTenantId,
  run: (drawer: Locator) => Promise<void>
): Promise<void> {
  const admin = TENANT_ADMINS[tenantId];
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(new URL('/catalog', base.url()).href, { timeout: 60_000, waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('catalog-identity')).toBeVisible({ timeout: 60_000 });
    await switchIdentity(page, admin.choice, admin.title, 'catalog-identity');
    await expect(roleBadge(page, tenantId, '管理员')).toBeVisible({ timeout: 30_000 });
    // 刚切完身份的页面还在加载本地库，开面板慢：放宽等待
    await run(await openSidePanel(page, 'server', 30_000));
  } finally {
    await context.close();
  }
}

/**
 * 商品页「身份与权限」里写着「<租户> · <角色>」的那一项
 *
 * @param page - 商品页
 * @param tenantId - 租户
 * @param role - 角色
 */
export function roleBadge(page: Page, tenantId: DemoTenantId, role: MemberRole): Locator {
  return page.getByTestId('catalog-role').filter({ hasText: `${TENANT_ADMINS[tenantId].name} · ${role}` });
}

/**
 * 自助加入只拿到员工（US-234）：请租户的管理员在另一个浏览器上下文里把这位成员设为管理员，成员再拉取一次，
 * 授权跟着重读，写入口就出现了
 *
 * @param browser - 浏览器
 * @param member - 已经加入租户的成员的商品页
 * @param tenantId - 租户
 */
export async function promoteToAdmin(browser: Browser, member: Page, tenantId: DemoTenantId = 'xinghe'): Promise<void> {
  const userId = await userIdOf(member);
  await withTenantAdmin(browser, member, tenantId, drawer => setRole(drawer, tenantId, userId, '管理员'));
  await pull(member);
  await expect(roleBadge(member, tenantId, '管理员')).toBeVisible({ timeout: 30_000 });
}
