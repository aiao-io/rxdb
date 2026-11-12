import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { INBOX_SEED_DATA, MAILBOX_SEED_DATA, MAIL_OWNER } from './mail-data';
import { MailMailbox, MailMessage } from './mail.entities';

/** 邮件的初始数据：侧栏的七个邮箱，以及收件箱里的七封邮件（顺序与原来一致）。 */
export const MAIL_SEED: DataSeed = {
  domain: 'mail',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const mailboxes = executor.getRepository(MailMailbox);
    const messages = executor.getRepository(MailMessage);
    const { entityManager } = rxdb;
    for (const [position, box] of MAILBOX_SEED_DATA.entries())
      await mailboxes.create(
        entityManager.instantiate(MailMailbox, { name: box.name, icon: box.icon, badge: box.count, position })
      );
    for (const [position, mail] of INBOX_SEED_DATA.entries())
      await messages.create(
        entityManager.instantiate(MailMessage, {
          mailbox: 'Inbox',
          sender: mail.from,
          recipient: MAIL_OWNER,
          subject: mail.subject,
          body: mail.preview,
          timeLabel: mail.time,
          color: mail.color,
          unread: mail.unread === true,
          flagged: mail.flag === true,
          position
        })
      );
  }
};
