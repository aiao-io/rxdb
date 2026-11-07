import { and, desc, eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import { db } from '../../../db/index';
import { notifications } from '../../../db/schema/notifications';
import type { GatewayDeps } from '../index';

export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

interface NotificationRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
  readAt: Date | null;
}

type Auth = { userId?: string; channel?: 'cookie' | 'authorization' | 'x-api-key' } | undefined;

interface CreateRouteContext {
  auth?: Auth;
  body: { type: string; title: string; body?: string; link?: string };
  set: { status?: number | string };
}

interface ListRouteContext {
  auth?: Auth;
  query: { unread?: string; limit?: string };
  set: { status?: number | string };
}

interface MarkReadRouteContext {
  auth?: Auth;
  params: { id: string };
  set: { status?: number | string };
}

interface ReadAllRouteContext {
  auth?: Auth;
  set: { status?: number | string };
}

// DB 不可达时（开发/测试环境）降级为进程内存储，与 workflow/routes.ts 的 fallback 约定一致
const fallbackStore = new Map<string, NotificationRecord>();

const toRecord = (row: NotificationRow): NotificationRecord => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  readAt: row.readAt ? row.readAt.toISOString() : null
});

/**
 * 构造 /notifications 路由（US-053）
 *
 * 挂载于既有 `/v1` 鉴权分组下，所有读写均以 `ctx.auth.userId` 过滤，防止跨用户越权访问。
 */
export function createNotificationsRoute(_deps: GatewayDeps) {
  return new Elysia()
    .post(
      '/notifications',
      async ({ auth, body, set }: CreateRouteContext) => {
        if (!auth?.userId) {
          set.status = 401;
          return { error: 'unauthorized' };
        }
        const userId = auth.userId;
        const id = `ntf_${crypto.randomUUID()}`;
        try {
          const [inserted] = await db
            .insert(notifications)
            .values({
              id,
              userId,
              type: body.type,
              title: body.title,
              body: body.body ?? null,
              link: body.link ?? null
            })
            .returning();
          return toRecord(inserted);
        } catch {
          const record: NotificationRecord = {
            id,
            userId,
            type: body.type,
            title: body.title,
            body: body.body ?? null,
            link: body.link ?? null,
            isRead: false,
            createdAt: new Date().toISOString(),
            readAt: null
          };
          fallbackStore.set(id, record);
          return record;
        }
      },
      {
        body: t.Object({
          type: t.String(),
          title: t.String(),
          body: t.Optional(t.String()),
          link: t.Optional(t.String())
        })
      }
    )
    .get(
      '/notifications',
      async ({ auth, query, set }: ListRouteContext) => {
        if (!auth?.userId) {
          set.status = 401;
          return { error: 'unauthorized' };
        }
        const userId = auth.userId;
        const limit = Math.min(parseInt(query.limit ?? '20', 10) || 20, 100);
        const unreadOnly = query.unread === 'true';
        try {
          const rows = await db
            .select()
            .from(notifications)
            .where(
              unreadOnly ?
                and(eq(notifications.userId, userId), eq(notifications.isRead, false))
              : eq(notifications.userId, userId)
            )
            .orderBy(desc(notifications.createdAt))
            .limit(limit);
          return { data: rows.map(toRecord) };
        } catch {
          const data = Array.from(fallbackStore.values())
            .filter(r => r.userId === userId)
            .filter(r => !unreadOnly || !r.isRead)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, limit);
          return { data };
        }
      },
      {
        query: t.Object({
          unread: t.Optional(t.String()),
          limit: t.Optional(t.String())
        })
      }
    )
    .patch(
      '/notifications/:id/read',
      async ({ auth, params, set }: MarkReadRouteContext) => {
        if (!auth?.userId) {
          set.status = 401;
          return { error: 'unauthorized' };
        }
        const userId = auth.userId;
        try {
          const [updated] = await db
            .update(notifications)
            .set({ isRead: true, readAt: new Date() })
            .where(and(eq(notifications.id, params.id), eq(notifications.userId, userId)))
            .returning();
          if (!updated) {
            set.status = 404;
            return { error: 'not-found' };
          }
          return toRecord(updated);
        } catch {
          const record = fallbackStore.get(params.id);
          if (!record || record.userId !== userId) {
            set.status = 404;
            return { error: 'not-found' };
          }
          record.isRead = true;
          record.readAt = new Date().toISOString();
          return record;
        }
      },
      {
        params: t.Object({ id: t.String() })
      }
    )
    .patch('/notifications/read-all', async ({ auth, set }: ReadAllRouteContext) => {
      if (!auth?.userId) {
        set.status = 401;
        return { error: 'unauthorized' };
      }
      const userId = auth.userId;
      try {
        const updated = await db
          .update(notifications)
          .set({ isRead: true, readAt: new Date() })
          .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
          .returning();
        return { updated: updated.length };
      } catch {
        let count = 0;
        for (const record of fallbackStore.values()) {
          if (record.userId === userId && !record.isRead) {
            record.isRead = true;
            record.readAt = new Date().toISOString();
            count++;
          }
        }
        return { updated: count };
      }
    });
}
