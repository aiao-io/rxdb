/** 历史本地 Sent 记录保留原键，不代表真正发送。 */
export const SENT_MAILBOX = 'Sent';
/** 新写入的邮件只作为本地草稿保存。 */
export const DRAFTS_MAILBOX = 'Drafts';
/** 汇集所有邮箱里打了旗的邮件。 */
export const FLAGGED_MAILBOX = 'Flagged';
/** 发出的邮件的头像底色：灰色，和信息 App 的新会话同色。 */
export const SENT_COLOR = '#8e8e93';

/** 过滤邮箱时用到的邮件字段。 */
export interface MailboxFields {
  readonly mailbox: string;
  readonly flagged: boolean;
}

/** 区分对方是谁时用到的邮件字段。 */
export interface PartyFields {
  readonly mailbox: string;
  readonly sender: string;
  readonly recipient: string;
}

/** 一个邮箱里显示的邮件，保持原有顺序：Flagged 汇集各邮箱里打了旗的，其余邮箱只显示放在里面的。 */
export function mailsIn<T extends MailboxFields>(mails: readonly T[], box: string): T[] {
  return mails.filter(mail => (box === FLAGGED_MAILBOX ? mail.flagged : mail.mailbox === box));
}

/** 对方是谁：发出的邮件是收件人，其余是发件人。回复就发给他。 */
export function counterpartOf(mail: PartyFields): string {
  return mail.mailbox === SENT_MAILBOX || mail.mailbox === DRAFTS_MAILBOX ? mail.recipient : mail.sender;
}

/** 列表与阅读区里显示的对方；发出的邮件没填收件人时写明。 */
export function partyOf(mail: PartyFields): string {
  return counterpartOf(mail) || 'No Recipient';
}


/** 邮箱内的关键词搜索覆盖往来人、主题和完整正文。 */
export function mailMatches(mail: Pick<PartyFields, 'sender' | 'recipient'> & { readonly subject: string; readonly body: string }, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || `${mail.sender} ${mail.recipient} ${mail.subject} ${mail.body}`.toLowerCase().includes(needle);
}

export const mailboxLabel = (name: string): string => name === SENT_MAILBOX ? 'Local Sent Archive' : name;
