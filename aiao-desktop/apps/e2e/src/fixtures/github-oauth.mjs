import { createHash } from 'node:crypto';
import { expect } from 'playwright/test';

/** 模拟 GitHub 和 Pages Functions；桌面授权窗口、回跳页与工作台都用实际构建。 */
export async function installGitHubOAuth(context, appOrigin, desktopOrigin) {
  const challengeByCode = new Map();
  const token = 'test-oauth-token';
  let exchanges = 0;
  let attempts = 0;

  await context.route('https://github.com/login/oauth/authorize?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('client_id')).toBe('test-client');
    expect(params.get('redirect_uri')).toBe(`${appOrigin}/redirect`);
    expect(params.get('code_challenge_method')).toBe('S256');
    const code = `fixture-code-${++attempts}`;
    challengeByCode.set(code, params.get('code_challenge'));
    const redirect = suffix => `${appOrigin}/redirect?state=${encodeURIComponent(params.get('state'))}&amp;${suffix}`;
    await route.fulfill({
      contentType: 'text/html; charset=utf-8',
      headers: { 'Cross-Origin-Opener-Policy': 'same-origin' },
      body: `<a href="${redirect(`code=${code}`)}">Authorize</a><a href="${redirect('error=access_denied')}">Deny</a>`
    });
  });
  await context.route(`${appOrigin}/redirect?*`, async route => {
    const params = new URL(route.request().url()).searchParams;
    const state = new URL(params.get('state'));
    expect(state.origin).toBe(appOrigin);
    expect(state.searchParams.get('desktop')).toBe(desktopOrigin);
    expect(state.searchParams.get('nonce')).toMatch(/^[0-9a-f]{32}$/);
    const callback = new URL('/github-oauth-return.html', desktopOrigin);
    callback.hash = params.toString();
    await route.fulfill({ status: 302, headers: { Location: callback.href } });
  });
  await context.route(`${appOrigin}/api/github-token`, async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { clientId: 'test-client' } });
    const body = route.request().postDataJSON();
    expect(body.redirect_uri).toBe(`${appOrigin}/redirect`);
    expect(createHash('sha256').update(body.code_verifier).digest('base64url')).toBe(challengeByCode.get(body.code));
    exchanges++;
    await route.fulfill({ json: { access_token: token } });
  });
  await context.route('https://api.github.com/user', async route => {
    const headers = {
      'Access-Control-Allow-Origin': appOrigin,
      'Access-Control-Allow-Headers': 'authorization, accept, x-github-api-version',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    await route.fulfill({ headers, json: { login: 'desktop-octo', avatar_url: null } });
  });
  return { exchanges: () => exchanges };
}
