import type { CollaborationController } from './controller.js';
import { button, element, input, section, type Perform } from './elements.js';

/** 登录视图用到的控制器部分。 */
export type LoginViewController = Pick<CollaborationController, 'online' | 'auth' | 'sendCode' | 'verify'>;

/** 登录表单里还没提交的输入：由挂载方持有，整块重绘（语言切换、状态变化）之间保留。 */
export interface LoginDraft {
  /** 邮箱输入框的当前值。 */
  email: string;
  /** 验证码输入框的当前值。 */
  token: string;
}

/**
 * 邮箱验证码登录：输入邮箱发送验证码，再用验证码登录。离线时，以及公开配置（Supabase 地址与公开密钥）还没取到、
 * 认证客户端还没建好时，两个按钮都不可用——那时点下去只会报「认证未配置」。配置取到之后控制器通知重绘，按钮随之可用。
 * @param controller 协作控制器。
 * @param perform 统一执行用户操作并处理失败的函数。
 * @param draft 输入的暂存；用户输入时随之更新，重绘时从这里恢复。
 */
export function loginView(controller: LoginViewController, perform: Perform, draft: LoginDraft): HTMLElement {
  const view = section('邮箱验证码登录');
  const email = input('邮箱', draft.email, 'email');
  const token = input('验证码', draft.token);
  email.control.autocomplete = 'email';
  token.control.autocomplete = 'one-time-code';
  email.control.oninput = () => {
    draft.email = email.control.value;
  };
  token.control.oninput = () => {
    draft.token = token.control.value;
  };
  const unavailable = !controller.online || !controller.auth;
  view.append(
    email.wrapper,
    button('发送验证码', () => perform(() => controller.sendCode(email.control.value)), unavailable),
    token.wrapper,
    button('登录', () => perform(() => controller.verify(email.control.value, token.control.value)), unavailable)
  );
  view.append(element('p', '登录不会上传匿名数据。团队草稿在会话确认前保持锁定。', 'text-sm'));
  return view;
}
