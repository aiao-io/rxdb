import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

const client = postgres(databaseUrl, { prepare: false, connect_timeout: 2 });

export const db = drizzle(client, { schema });

export * from './schema';
