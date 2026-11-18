import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { codeSubject, latestCode, mailboxOf } from './mail.mjs';

const mailUrl = 'http://127.0.0.1:4502';
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });

/** 只认识给定路径的收件服务替身，并记下每个请求。 */
function inbox(routes) {
  const requested = [];
  const fetch = async url => {
    requested.push(url);
    const route = routes[url.slice(mailUrl.length)];
    return route ? route() : reply({ error: 'not found' }, 404);
  };
  return { fetch, requested };
}

describe('本地收件服务里的验证码', () => {
  it('收件箱名就是邮箱 @ 前的部分（收件服务按它分箱）', () => {
    assert.equal(mailboxOf('Reviewer@admin-template.local'), 'reviewer');
  });

  it('取最新一封验证码邮件里的 6 位验证码与送达时间', async () => {
    const { fetch, requested } = inbox({
      '/api/v1/mailbox/reviewer': () =>
        reply([
          { id: 'older', subject: codeSubject, date: '2026-11-18T08:00:00Z' },
          { id: 'newest', subject: codeSubject, date: '2026-11-18T08:05:00Z' },
          { id: 'other', subject: '别的邮件', date: '2026-11-18T08:09:00Z' }
        ]),
      '/api/v1/mailbox/reviewer/newest': () =>
        reply({ body: { html: '<p style="font-size: 24px; letter-spacing: 4px">482913</p>' } })
    });
    assert.deepEqual(await latestCode('reviewer@admin-template.local', { mailUrl, fetch }), {
      code: '482913',
      receivedAt: '2026-11-18T08:05:00Z'
    });
    assert.deepEqual(requested, [`${mailUrl}/api/v1/mailbox/reviewer`, `${mailUrl}/api/v1/mailbox/reviewer/newest`]);
  });

  it('还没有验证码邮件时返回 null', async () => {
    const { fetch } = inbox({ '/api/v1/mailbox/viewer': () => reply([]) });
    assert.equal(await latestCode('viewer@admin-template.local', { mailUrl, fetch }), null);
  });

  it('收件服务出错时报错，不当成没有邮件', async () => {
    const { fetch } = inbox({ '/api/v1/mailbox/owner': () => reply({ error: 'boom' }, 500) });
    await assert.rejects(latestCode('owner@admin-template.local', { mailUrl, fetch }), /收件服务.*500/);
  });
});
