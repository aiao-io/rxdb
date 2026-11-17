import { describe, expect, it } from 'vitest';

import { DRAFTS_MAILBOX, FLAGGED_MAILBOX, SENT_MAILBOX, counterpartOf, mailMatches, mailsIn, partyOf } from './mail-model';

const mail = (id: string, mailbox: string, flagged = false) => ({ id, mailbox, flagged });

describe('mailsIn', () => {
  const mails = [mail('a', 'Inbox', true), mail('b', 'Inbox'), mail('c', SENT_MAILBOX, true), mail('d', SENT_MAILBOX)];

  it('普通邮箱只显示放在里面的邮件，顺序不变', () => {
    expect(mailsIn(mails, 'Inbox').map(item => item.id)).toEqual(['a', 'b']);
    expect(mailsIn(mails, SENT_MAILBOX).map(item => item.id)).toEqual(['c', 'd']);
  });

  it('Flagged 汇集所有邮箱里打了旗的邮件', () => {
    expect(mailsIn(mails, FLAGGED_MAILBOX).map(item => item.id)).toEqual(['a', 'c']);
  });

  it('没有这个邮箱时是空列表', () => {
    expect(mailsIn(mails, 'Trash')).toEqual([]);
  });
});

describe('partyOf', () => {
  it('收到的邮件显示发件人', () => {
    expect(partyOf({ mailbox: 'Inbox', sender: 'Figma', recipient: 'Prasenjit' })).toBe('Figma');
  });

  it('发出的邮件显示收件人', () => {
    expect(partyOf({ mailbox: SENT_MAILBOX, sender: 'Prasenjit', recipient: 'anna@example.com' })).toBe(
      'anna@example.com'
    );
  });

  it('发出的邮件没填收件人时写明', () => {
    expect(partyOf({ mailbox: SENT_MAILBOX, sender: 'Prasenjit', recipient: '' })).toBe('No Recipient');
  });
});

describe('counterpartOf', () => {
  it('收到的邮件回复给发件人，发出的邮件回复给收件人', () => {
    expect(counterpartOf({ mailbox: 'Inbox', sender: 'Figma', recipient: 'Prasenjit' })).toBe('Figma');
    expect(counterpartOf({ mailbox: SENT_MAILBOX, sender: 'Prasenjit', recipient: 'anna@example.com' })).toBe(
      'anna@example.com'
    );
  });

  it('发出的邮件没填收件人时保持为空，不写占位文字', () => {
    expect(counterpartOf({ mailbox: SENT_MAILBOX, sender: 'Prasenjit', recipient: '' })).toBe('');
  });
});


describe('本地草稿和搜索', () => {
  it('草稿以收件人为对象；本地保存不会认作发给自己', () => {
    expect(partyOf({ mailbox: DRAFTS_MAILBOX, sender: 'Me', recipient: 'reader@example.invalid' }))
      .toBe('reader@example.invalid');
  });
  it('关键词匹配发件人、收件人、主题和正文，不区分大小写', () => {
    const item = { sender: 'Alice', recipient: 'Bob', subject: 'Local', body: 'Body 🌏' };
    for (const query of ['ALICE', 'bob', 'local', 'body', '🌏', '   ']) expect(mailMatches(item, query)).toBe(true);
    expect(mailMatches(item, 'nothing matches')).toBe(false);
  });
});
