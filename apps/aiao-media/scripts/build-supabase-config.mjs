import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateSupabaseAuthConfig } from '../src/app/supabase-auth-config.ts';

export function supabaseHeaders(template, config) {
  if (config == null) return template;
  const { url } = validateSupabaseAuthConfig(config);
  if (new URL(url).protocol !== 'http:') return template;
  // Local Auth is explicitly allowed by config validation. Permit that exact
  // loopback origin without opening production CSP to arbitrary HTTP hosts.
  const directive = "connect-src 'self' https:;";
  if (!template.includes(directive)) throw new Error('Missing static connection policy.');
  return template.replace(directive, `connect-src 'self' https: ${url};`);
}

export async function buildSupabaseConfig(env, output) {
  const url = env.AIAO_SUPABASE_URL?.trim();
  const anonKey = env.AIAO_SUPABASE_ANON_KEY?.trim();
  const config = url || anonKey ? validateSupabaseAuthConfig({ url, anonKey }) : null;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `globalThis.__AIAO_SUPABASE_CONFIG__ = ${JSON.stringify(config)};\n`);
  return Boolean(config);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const enabled = await buildSupabaseConfig(process.env, resolve(import.meta.dirname, '../public/app-config.js'));
  console.log(
    enabled ?
      'Public Supabase account configuration prepared.'
    : 'Account service disabled; local creation remains available.'
  );
}
