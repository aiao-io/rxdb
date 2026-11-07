import { boolean, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * notifications (US-053)
 * 用户站内通知：安全事件（如改密后其他设备登出）、系统消息等。
 */
export const notifications = pgTable('notifications', {
  id: varchar('id', { length: 256 }).primaryKey(),
  userId: varchar('user_id', { length: 256 }).notNull(),
  type: varchar('type', { length: 64 }).notNull(),
  title: text('title').notNull(),
  body: text('body'),
  link: text('link'),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  readAt: timestamp('read_at')
});
