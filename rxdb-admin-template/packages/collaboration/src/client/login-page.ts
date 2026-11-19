import { element, type Perform } from './elements.js';
import { icon } from './icons.js';
import { loginView, type LoginDraft } from './login-view.js';
import { authSession, type AuthSession } from './session.js';
import { useTranslation, type Translate } from './translate.js';

/** 挂载全局登录页时的选项；三端应用传入的内容对称。 */
export interface LoginPageOptions {
  /** 全局登录会话，默认 {@link authSession}。 */
  session?: AuthSession;
  /** 应用的翻译函数，约定同 `mountCollaboration`。 */
  translate?: Translate;
  /** 订阅应用的语言切换，收到通知后重绘；返回取消订阅函数。 */
  subscribeLanguage?: (listener: () => void) => () => void;
  /** 登录成功、或打开时已经登录：应用跳到登录前想去的页面（`redirect` 参数）。 */
  signedIn: () => void;
  /** 登录前想去的页面带着团队邀请（`#join=…`）：卡片里提示用受邀邮箱登录。 */
  invited?: boolean;
  /** 页面顶部的应用名（已翻译，原样显示）。 */
  brand?: () => string;
}

/**
 * 全局登录页（`/login`，在后台外壳之外）：居中的邮箱验证码登录卡片。
 *
 * @remarks
 * 全站必须登录后才能使用（三端的路由守卫把未登录的访问带到这里，并在 `redirect` 参数里记下原来的地址）。
 * 打开时会话还没建好就先建（读公开配置、恢复本机会话）；已经登录、或登录成功之后调用 `signedIn` 交给应用跳转。
 * 登录相关的提示（验证码已发送、验证码错误等）显示在卡片里；重绘之间保留输入与键盘焦点。
 * @param host 承载登录页的容器元素；卸载时清空。
 * @param options 会话、翻译与跳转回调。
 * @returns 卸载函数。
 */
export function mountLogin(host: HTMLElement, options: LoginPageOptions): () => void {
  useTranslation(options.translate);
  const session = options.session ?? authSession();
  const draft: LoginDraft = { email: '', token: '' };
  let disposed = false;
  let left = false;
  const perform: Perform = async work => {
    host.setAttribute('aria-busy', 'true');
    try {
      await work();
    } catch (error) {
      session.notify(error instanceof Error ? error.message : '登录失败，请稍后重试', 'error');
      session.changed();
    } finally {
      host.setAttribute('aria-busy', 'false');
      render();
    }
  };
  const dismiss = () => {
    session.notify('');
    render();
  };
  function render() {
    if (disposed) return;
    if (session.user) {
      if (left) return;
      left = true;
      // 不在重绘途中跳转：应用的路由会卸载这个页面
      queueMicrotask(options.signedIn);
      return;
    }
    const active = document.activeElement;
    const focused =
      active instanceof HTMLInputElement && host.contains(active) ? active.getAttribute('aria-label') : null;
    const main = element(
      'main',
      '',
      'flex min-h-full flex-col items-center justify-center gap-6 bg-base-200 px-4 py-10'
    );
    const brand = element('h1', '', 'flex items-center gap-2 text-lg font-semibold');
    brand.append(icon('database', 'size-5'), element('span', options.brand?.() ?? '', '', true));
    const card = loginView(
      {
        online: navigator.onLine,
        auth: session.auth,
        sendCode: email => session.sendCode(email),
        verify: (email, token) => session.verify(email, token),
        message: session.message,
        messageTone: session.messageTone
      },
      perform,
      draft,
      { invited: options.invited, dismiss }
    );
    card.classList.replace('py-4', 'py-0');
    main.append(brand, card);
    host.replaceChildren(main);
    if (!focused) return;
    for (const node of host.querySelectorAll<HTMLInputElement>('input[aria-label]'))
      if (node.getAttribute('aria-label') === focused) node.focus({ preventScroll: true });
  }
  host.className = 'collaboration-login page-host overflow-auto';
  session.addEventListener('change', render);
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  const unsubscribeLanguage = options.subscribeLanguage?.(render);
  render();
  void perform(() => session.initialize());
  return () => {
    disposed = true;
    session.removeEventListener('change', render);
    window.removeEventListener('online', render);
    window.removeEventListener('offline', render);
    unsubscribeLanguage?.();
    host.replaceChildren();
  };
}
