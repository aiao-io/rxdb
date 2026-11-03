import { GitHubApiError } from './github-api.js';
import type { GitHubAuth, GitHubSession } from './github-auth.js';
import { oauthDoneKey, savePendingOAuth } from './github-oauth-bridge.js';
import { ensureGithubStyle } from './github-style.js';

export interface GitHubLoginRequest {
  readonly auth: GitHubAuth;
  /** 打开授权页；默认弹窗，测试可注入。 */
  readonly openAuthorize?: (url: string) => void;
}

const POLL_INTERVAL_MS = 2000;

/**
 * GitHub 登录对话框：已登录显示账户与登出；未登录提供 PAT 输入与 OAuth 弹窗授权。
 * OAuth 在独立弹窗完成（pending 经 localStorage 桥接），storage 事件 + 轮询双通道同步回本标签页。
 */
export function requestGitHubLogin(host: HTMLElement, request: GitHubLoginRequest): Promise<void> {
  return new Promise(resolve => {
    const { auth } = request;
    const openAuthorize =
      request.openAuthorize ??
      (url => {
        const popup = window.open(url, 'aiao-github-oauth', 'popup,width=600,height=750');
        if (!popup) throw new Error('浏览器拦截了登录弹窗，请允许弹窗后重试');
      });
    ensureGithubStyle();
    const dialog = document.createElement('dialog');
    dialog.className = 'wb-dialog wb-github-dialog wb-github-login';
    const heading = document.createElement('h3');
    heading.textContent = 'GitHub 登录';
    const content = document.createElement('div');
    const actions = document.createElement('div');
    actions.className = 'wb-dialog-actions';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '关闭';
    actions.append(close);
    dialog.append(heading, content, actions);
    host.append(dialog);

    let settled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const settle = (): void => {
      if (settled) return;
      settled = true;
      stopWatching();
      dialog.close();
      resolve();
    };
    close.onclick = () => settle();
    dialog.oncancel = () => settle();
    dialog.onclose = () => dialog.remove();

    const error = (value: string): void => {
      const line = document.createElement('p');
      line.className = 'wb-github-message wb-github-error';
      line.textContent = value;
      content.append(line);
    };

    const renderLoggedOut = (): void => {
      content.replaceChildren();
      actions.replaceChildren(close);
      const field = document.createElement('div');
      field.className = 'wb-github-field';
      const label = document.createElement('label');
      label.textContent = '个人访问令牌（PAT）';
      const input = document.createElement('input');
      input.type = 'password';
      input.placeholder = 'ghp_…（仅本机存储，不出浏览器）';
      input.setAttribute('aria-label', '个人访问令牌');
      const patButton = document.createElement('button');
      patButton.type = 'button';
      patButton.className = 'wb-primary';
      patButton.textContent = '登录';
      patButton.onclick = () => {
        const token = input.value.trim();
        if (!token) {
          error('请输入 PAT');
          return;
        }
        patButton.disabled = true;
        void auth
          .loginWithPat(token)
          .then(session => renderLoggedIn(session))
          .catch(cause => {
            patButton.disabled = false;
            error(
              cause instanceof GitHubApiError ? cause.message
              : cause instanceof Error ? cause.message
              : String(cause)
            );
          });
      };
      field.append(label, input, patButton);
      content.append(field);
      const divider = document.createElement('div');
      divider.className = 'wb-github-divider';
      divider.textContent = '或';
      content.append(divider);
      const oauthButton = document.createElement('button');
      oauthButton.type = 'button';
      oauthButton.textContent = '使用 GitHub 账号登录';
      oauthButton.onclick = () => {
        void (async () => {
          try {
            const pending = await auth.beginOAuth();
            savePendingOAuth({
              verifier: pending.verifier,
              nonce: new URL(pending.state).searchParams.get('nonce') ?? '',
              state: pending.state,
              at: Date.now()
            });
            openAuthorize(pending.authorizeUrl);
            renderWaiting();
          } catch (cause) {
            error(cause instanceof Error ? cause.message : String(cause));
          }
        })();
      };
      content.append(oauthButton);
      content.append(
        Object.assign(document.createElement('p'), {
          className: 'wb-github-message wb-github-hint',
          textContent: '私有仓库需要登录；公开仓库可以直接打开。'
        })
      );
    };

    const renderWaiting = (): void => {
      content.replaceChildren();
      actions.replaceChildren(close);
      const waiting = document.createElement('p');
      waiting.className = 'wb-github-waiting';
      waiting.textContent = '等待 GitHub 授权完成…（在弹窗中操作）';
      content.append(waiting);
      startWatching();
    };

    const renderLoggedIn = (session: GitHubSession): void => {
      stopWatching();
      content.replaceChildren();
      const account = document.createElement('div');
      account.className = 'wb-github-account';
      if (session.avatarUrl) {
        const avatar = document.createElement('img');
        avatar.src = session.avatarUrl;
        avatar.alt = '';
        account.append(avatar);
      }
      const name = document.createElement('span');
      name.className = 'wb-github-account-name';
      name.textContent = session.login;
      account.append(name);
      content.append(account);
      content.append(
        Object.assign(document.createElement('p'), {
          className: 'wb-github-message wb-github-hint',
          textContent: `已连接 GitHub（${session.provider === 'pat' ? 'PAT' : 'OAuth'}）`
        })
      );
      const logout = document.createElement('button');
      logout.type = 'button';
      logout.textContent = '登出';
      logout.onclick = () => {
        logout.disabled = true;
        void auth
          .logout()
          .then(renderLoggedOut)
          .catch(cause => {
            logout.disabled = false;
            error(cause instanceof Error ? cause.message : String(cause));
          });
      };
      actions.replaceChildren(logout, close);
    };

    const checkOAuthResult = (): void => {
      void auth
        .refresh()
        .then(session => {
          if (!settled && session) renderLoggedIn(session);
        })
        .catch(() => undefined);
    };
    const onStorage = (event: StorageEvent): void => {
      if (event.key === oauthDoneKey()) checkOAuthResult();
    };
    const startWatching = (): void => {
      window.addEventListener('storage', onStorage);
      if (timer) clearInterval(timer);
      timer = setInterval(checkOAuthResult, POLL_INTERVAL_MS);
    };
    const stopWatching = (): void => {
      window.removeEventListener('storage', onStorage);
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    dialog.showModal();
    void auth
      .getSession()
      .then(session => {
        if (settled) return;
        if (session) renderLoggedIn(session);
        else renderLoggedOut();
      })
      .catch(cause => {
        if (settled) return;
        renderLoggedOut();
        error(cause instanceof Error ? cause.message : String(cause));
      });
  });
}
