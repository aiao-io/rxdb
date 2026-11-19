import { alert, button, element, iconTile, input, type Perform } from './elements.js';
import { icon } from './icons.js';
import type { AuthSession } from './session.js';

/** 登录视图用到的会话部分，外加浏览器当前是否联网。 */
export type LoginViewController = Pick<AuthSession, 'auth' | 'sendCode' | 'verify' | 'message' | 'messageTone'> & {
  online: boolean;
};

/** 登录表单里还没提交的输入：由挂载方持有，整块重绘（语言切换、状态变化）之间保留。 */
export interface LoginDraft {
  /** 邮箱输入框的当前值。 */
  email: string;
  /** 验证码输入框的当前值。 */
  token: string;
}

/** {@link loginView} 的可选项。 */
export interface LoginViewOptions {
  /** 页面地址带着邀请链接：提示登录受邀邮箱后再接受邀请。 */
  invited?: boolean;
  /** 关闭卡片里的提示。 */
  dismiss?: () => void;
}

/**
 * 邮箱验证码登录卡片（全局登录页用）：邮箱右侧是「发送验证码」，下面是验证码与主按钮「登录」；已经拿到验证码的人可以直接填写。
 * 邮箱里按回车即发送验证码、验证码里按回车即登录，发送成功后焦点移到验证码。离线时，以及公开配置（Supabase 地址与公开密钥）
 * 还没取到、认证客户端还没建好时，两个按钮都不可用——那时点下去只会报「认证未配置」；卡片里说明原因，配置取到之后控制器通知重绘。
 * 登录相关的提示（验证码已发送、验证码错误等）显示在卡片里，紧挨着表单。
 * @param controller 协作控制器。
 * @param perform 统一执行用户操作并处理失败的函数。
 * @param draft 输入的暂存；用户输入时随之更新，重绘时从这里恢复。
 * @param options 邀请提示与关闭提示的回调。
 */
export function loginView(
  controller: LoginViewController,
  perform: Perform,
  draft: LoginDraft,
  options: LoginViewOptions = {}
): HTMLElement {
  const view = element('div', '', 'mx-auto w-full max-w-md py-4 sm:py-8');
  const card = element('section', '', 'space-y-6 rounded-box border border-base-300 bg-base-100 p-6 shadow-sm sm:p-8');
  const header = element('header', '', 'flex flex-col items-center gap-3 text-center');
  header.append(
    iconTile('mail', 'lg'),
    element('h2', '邮箱验证码登录', 'text-xl font-semibold'),
    element('p', '无需密码：用邮箱收到的验证码登录，登录后使用本机工作台与团队协作', 'text-sm text-base-content/70')
  );
  card.append(header);
  if (options.invited) card.append(alert('已识别邀请链接：用受邀邮箱登录后即可接受邀请', 'info'));
  if (controller.message) card.append(alert(controller.message, controller.messageTone, options.dismiss));

  const email = input('邮箱', draft.email, 'email', { size: 'md', placeholder: 'name@company.com' });
  const token = input('验证码', draft.token, 'text', { size: 'md', placeholder: '6 位数字' });
  email.control.autocomplete = 'email';
  token.control.autocomplete = 'one-time-code';
  token.control.inputMode = 'numeric';
  token.control.classList.add('font-mono', 'tracking-[0.3em]', 'placeholder:tracking-normal', 'placeholder:font-sans');
  email.control.oninput = () => {
    draft.email = email.control.value;
  };
  token.control.oninput = () => {
    draft.token = token.control.value;
  };
  const unavailable = !controller.online || !controller.auth;
  const send = button(
    '发送验证码',
    () =>
      perform(async () => {
        await controller.sendCode(email.control.value);
        // 重绘之后焦点交给新的验证码输入框
        queueMicrotask(() => document.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')?.focus());
      }),
    unavailable,
    { size: 'md', icon: 'send' }
  );
  const login = button(
    '登录',
    () => perform(() => controller.verify(email.control.value, token.control.value)),
    unavailable,
    { tone: 'primary', size: 'md', className: 'w-full' }
  );
  email.control.addEventListener('keydown', event => {
    if (event.key === 'Enter') send.click();
  });
  token.control.addEventListener('keydown', event => {
    if (event.key === 'Enter') login.click();
  });
  const emailRow = element('div', '', 'flex items-end gap-2');
  email.wrapper.classList.add('flex-1');
  emailRow.append(email.wrapper, send);
  const form = element('div', '', 'space-y-4');
  form.append(emailRow, token.wrapper, login);
  if (unavailable) form.append(unavailableHint(controller.online));
  const note = element('p', '', 'flex items-start gap-2 border-t border-base-300 pt-4 text-xs text-base-content/70');
  note.append(icon('lock', 'mt-0.5 size-3.5'), element('span', '登录不会上传本机数据。团队草稿在会话确认前保持锁定。'));
  card.append(form, note);
  view.append(card);
  return view;
}

/** 两个按钮为什么不可用：离线，或认证服务还没连上。 */
function unavailableHint(online: boolean): HTMLElement {
  const hint = element('p', '', 'flex items-center gap-2 text-sm text-base-content/70');
  hint.setAttribute('role', 'status');
  if (online)
    hint.append(element('span', '', 'loading loading-spinner loading-xs'), element('span', '正在连接认证服务…'));
  else hint.append(icon('cloud-off'), element('span', '离线时无法登录，联网后再试'));
  return hint;
}
