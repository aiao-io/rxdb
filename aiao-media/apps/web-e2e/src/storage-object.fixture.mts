import { expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import { localEnvironment } from '../../../scripts/supabase/supabase-local.mjs';

/** 字节使用内存 fixture，目录操作使用真实本地 PostgreSQL 的受权账号和 Storage RLS。 */
export async function storageObjectFixture(admin: SupabaseClient) {
  const { env } = await localEnvironment();
  const files = new Map<string, Buffer>();
  const paths = new Set<string>();
  async function connection(role: 'authenticator' | 'supabase_admin'): Promise<pg.Client> {
    const client = new pg.Client({
      host: '127.0.0.1',
      port: Number(env['DB_PORT']),
      user: role,
      password: env['POSTGRES_PASSWORD'],
      database: 'postgres',
      connectionTimeoutMillis: 5000,
      query_timeout: 10000
    });
    await client.connect();
    return client;
  }
  async function authenticated<T>(
    authorization: string | undefined,
    operation: (client: pg.Client, userId: string) => Promise<T>
  ): Promise<T> {
    expect(authorization).toMatch(/^Bearer /);
    const user = await admin.auth.getUser(authorization!.slice(7));
    expect(user.error).toBeNull();
    expect(user.data.user).not.toBeNull();
    const client = await connection('authenticator');
    try {
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user.data.user!.id]);
      await client.query('SET ROLE authenticated');
      return await operation(client, user.data.user!.id);
    } finally {
      await client.end();
    }
  }
  return {
    files,
    async put(path: string, bytes: Buffer, authorization: string | undefined) {
      expect(path.startsWith('aiao-media-images/')).toBe(true);
      const name = path.slice('aiao-media-images/'.length);
      await authenticated(authorization, async (client, userId) => {
        await client.query(`INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('aiao-media-images',$1,$2)`, [
          name,
          userId
        ]);
      });
      files.set(path, bytes);
      paths.add(name);
    },
    async remove(prefixes: string[], authorization: string | undefined) {
      expect(prefixes).toHaveLength(1);
      return authenticated(authorization, async client => {
        const result = await client.query<{ name: string }>(
          `DELETE FROM storage.objects WHERE bucket_id='aiao-media-images' AND name=$1 RETURNING name`,
          [prefixes[0]]
        );
        for (const row of result.rows) files.delete(`aiao-media-images/${row.name}`);
        return result.rows;
      });
    },
    async count() {
      const client = await connection('supabase_admin');
      try {
        const result = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM storage.objects WHERE bucket_id='aiao-media-images' AND name=ANY($1)`,
          [[...paths]]
        );
        return Number(result.rows[0].count);
      } finally {
        await client.end();
      }
    },
    async close() {
      const client = await connection('supabase_admin');
      try {
        await client.query(`DELETE FROM storage.objects WHERE bucket_id='aiao-media-images' AND name=ANY($1)`, [
          [...paths]
        ]);
      } finally {
        await client.end();
      }
    }
  };
}
