import { describe, expect, it } from 'vitest';
import { carriesInvitation, createInvitationLink, parseInvitationLink } from './invitation-link.js';

const ticket = { teamId: 'team-1', appId: 'assets', id: 'invite-1', token: 'secret-token-0123456789' };
const encoded = (value: unknown) => encodeURIComponent(JSON.stringify(value));

describe('邀请链接', () => {
  it('把令牌放进 fragment，不进入查询参数，并丢弃当前页面原有的查询与 fragment', () => {
    const link = new URL(
      createInvitationLink('https://admin.example/collaboration?theme=dark&join=old#section', ticket)
    );
    expect(link.origin + link.pathname).toBe('https://admin.example/collaboration');
    expect(link.search).toBe('');
    expect(link.searchParams.has('join')).toBe(false);
    expect(link.href).not.toContain('?');
    expect(link.hash.startsWith('#join=')).toBe(true);
    expect(JSON.parse(new URLSearchParams(link.hash.slice(1)).get('join')!)).toEqual(ticket);
  });

  it('接受 URL 对象，且往返解析后与原始字段完全一致，包括需要转义的字符', () => {
    const awkward = { teamId: 'team/一 & two#3', appId: 'a+b c%20d', id: '"quoted"', token: '中文 token?x=1&y=2' };
    const link = createInvitationLink(new URL('https://admin.example:8443/base/collaboration'), awkward);
    expect(parseInvitationLink(link)).toEqual(awkward);
    expect(parseInvitationLink(createInvitationLink('https://admin.example/collaboration', ticket))).toEqual(ticket);
  });

  it('同时接受 encodeURIComponent 与表单风格的转义，只取四个已知字段', () => {
    const link = `https://admin.example/collaboration#join=${encoded({ ...ticket, extra: 'ignored' })}`;
    expect(parseInvitationLink(link)).toEqual(ticket);
    const form = new URLSearchParams({ join: JSON.stringify(ticket), other: '1' });
    expect(parseInvitationLink(`https://admin.example/collaboration#${form}`)).toEqual(ticket);
  });

  it.each([
    ['不是 URL', 'not a url'],
    ['空字符串', ''],
    ['没有 fragment', 'https://admin.example/collaboration'],
    ['fragment 没有 join', 'https://admin.example/collaboration#other=1'],
    ['join 为空', 'https://admin.example/collaboration#join='],
    ['旧格式：令牌在查询参数里', `https://admin.example/collaboration?join=${encoded(ticket)}`],
    ['JSON 无法解析', 'https://admin.example/collaboration#join=%7Boops'],
    ['JSON 是数组', `https://admin.example/collaboration#join=${encoded([ticket])}`],
    ['JSON 是 null', 'https://admin.example/collaboration#join=null'],
    ['JSON 是字符串', `https://admin.example/collaboration#join=${encoded('token')}`],
    ['缺少 token', `https://admin.example/collaboration#join=${encoded({ ...ticket, token: undefined })}`],
    ['teamId 是数字', `https://admin.example/collaboration#join=${encoded({ ...ticket, teamId: 1 })}`],
    ['appId 为空串', `https://admin.example/collaboration#join=${encoded({ ...ticket, appId: '' })}`],
    ['id 是 null', `https://admin.example/collaboration#join=${encoded({ ...ticket, id: null })}`]
  ])('拒绝非法链接并统一报告「邀请链接格式错误」：%s', (_name, link) => {
    expect(() => parseInvitationLink(link)).toThrow(new Error('邀请链接格式错误'));
  });

  it('只在 fragment 携带 join 时才视为邀请链接，用于预填输入框', () => {
    expect(carriesInvitation(createInvitationLink('https://admin.example/collaboration', ticket))).toBe(true);
    expect(carriesInvitation('https://admin.example/collaboration#join=anything')).toBe(true);
    expect(carriesInvitation('https://admin.example/collaboration')).toBe(false);
    expect(carriesInvitation('https://admin.example/collaboration#other=1')).toBe(false);
    expect(carriesInvitation(`https://admin.example/collaboration?join=${encoded(ticket)}`)).toBe(false);
    expect(carriesInvitation('not a url')).toBe(false);
  });
});
