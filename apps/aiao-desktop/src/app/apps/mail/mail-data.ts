/** 一封邮件；未读与旗标可变，所以状态放在窗口的信号里，种子本身不动。 */
export interface MailMessage {
  readonly from: string;
  readonly subject: string;
  readonly preview: string;
  readonly time: string;
  readonly color: string;
  readonly unread?: boolean;
  readonly flag?: boolean;
}

/** 侧栏里的一个邮箱；`count` 是徽标上的固定数字。 */
export interface Mailbox {
  readonly name: string;
  readonly icon: string;
  readonly count: number | null;
}

export const MAILBOXES: readonly Mailbox[] = [
  { name: 'Inbox', icon: 'g-download', count: 2 },
  { name: 'VIP', icon: 'g-star', count: null },
  { name: 'Flagged', icon: 'g-tag', count: 2 },
  { name: 'Drafts', icon: 'g-title', count: 1 },
  { name: 'Sent', icon: 'g-share', count: null },
  { name: 'Junk', icon: 'g-tag', count: null },
  { name: 'Trash', icon: 'g-tag', count: null }
];

export const MAIL_SEED: readonly MailMessage[] = [
  {
    from: 'Figma',
    subject: 'Daniel left 3 comments on Desktop v4',
    preview: 'Tray blur reads heavy at 62px — can we try 44 and put them side by side?',
    time: '4:21 PM',
    color: '#a259ff',
    unread: true,
    flag: true
  },
  {
    from: 'Vercel',
    subject: 'Your deployment is live',
    preview: 'desktop-web is ready. Build finished in 0s — there was nothing to build.',
    time: '3:58 PM',
    color: '#1d1d1f',
    unread: true
  },
  {
    from: 'Linear',
    subject: 'ENG-412 moved to In Review',
    preview: 'Shadow repaint during minimise: 12 dropped frames down to 0. Needs your sign-off.',
    time: '1:12 PM',
    color: '#5e6ad2'
  },
  {
    from: 'GitHub',
    subject: '[workspace/desktop] PR #142 review requested',
    preview: 'Column view: preview pane sizing. 4 files changed, +218 −31.',
    time: '11:04 AM',
    color: '#24292f'
  },
  {
    from: 'Anna Haro',
    subject: 'Re: dock easing',
    preview: 'The cosine falloff is right, but shorten the settle. Under 300ms or it reads as lag.',
    time: 'Yesterday',
    color: '#bf5af2'
  },
  {
    from: 'Apple Developer',
    subject: 'macOS Tahoe 26 beta 4 is available',
    preview: 'Liquid Glass refinements, Spotlight actions, and 42 resolved issues.',
    time: 'Yesterday',
    color: '#1d1d1f'
  },
  {
    from: 'Mom',
    subject: 'call me when free',
    preview: 'and eat something that is not coffee',
    time: 'Saturday',
    color: '#ff375f',
    flag: true
  }
];
