/**
 * 本地收件服务（inbucket，`deploy/local` 栈的 `mail`）里的登录验证码。GoTrue 把验证码邮件经 SMTP 发到这里，
 * 收件服务按邮箱 @ 前的部分分箱；开发导航据此给每个测试账号显示最新的验证码，不用再去翻邮件。
 */

/** 验证码邮件的标题（`deploy/local/docker-compose.yml` 的 GOTRUE_MAILER_SUBJECTS_*）。 */
export const codeSubject = 'Admin 模板登录验证码';

/** 收件服务的收件箱名：邮箱 @ 前的部分。 */
export function mailboxOf(email) {
  return email.slice(0, email.indexOf('@')).toLowerCase();
}

async function readJson(fetch, url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`收件服务返回 ${response.status}：${new URL(url).pathname}`);
  return response.json();
}

/**
 * 某个邮箱收到的最新一封验证码邮件里的 6 位验证码与送达时间；还没有验证码邮件时为 null。
 *
 * @param {string} email 收件邮箱
 * @param {object} options
 * @param {string} options.mailUrl 收件服务地址
 * @param {typeof globalThis.fetch} [options.fetch]
 * @returns {Promise<{ code: string, receivedAt: string } | null>}
 */
export async function latestCode(email, { mailUrl, fetch = globalThis.fetch }) {
  const mailbox = `${mailUrl}/api/v1/mailbox/${encodeURIComponent(mailboxOf(email))}`;
  const messages = await readJson(fetch, mailbox);
  const latest = messages
    .filter(message => message.subject === codeSubject)
    .toSorted((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .at(-1);
  if (!latest) return null;
  const message = await readJson(fetch, `${mailbox}/${encodeURIComponent(latest.id)}`);
  const code = /\b(\d{6})\b/.exec(message.body.html)?.[1];
  return code ? { code, receivedAt: latest.date } : null;
}
