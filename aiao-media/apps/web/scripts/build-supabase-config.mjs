import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateSupabaseAuthConfig } from '../src/app/supabase-auth-config.ts';

export function supabaseHeaders(template, config) {
  if (config == null) return template;
  const { url } = validateSupabaseAuthConfig(config);
  const origin = new URL(url);
  const realtime = `${origin.protocol === 'https:' ? 'wss:' : 'ws:'}//${origin.host}`;
  const extra = origin.protocol === 'http:' ? `${url} ${realtime}` : realtime;
  const directive = "connect-src 'self' https:;";
  if (!template.includes(directive)) throw new Error('Missing static connection policy.');
  return template.replace(directive, `connect-src 'self' https: ${extra};`);
}

export async function buildSupabaseConfig(env, output) {
  const url = env.AIAO_SUPABASE_URL?.trim();
  const anonKey = env.AIAO_SUPABASE_ANON_KEY?.trim();
  const storageUrl = env.AIAO_SUPABASE_STORAGE_URL?.trim();
  const config =
    url || anonKey ? validateSupabaseAuthConfig({ url, anonKey, ...(storageUrl ? { storageUrl } : {}) }) : null;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `globalThis.__AIAO_SUPABASE_CONFIG__ = ${JSON.stringify(config)};\n`);
  return Boolean(config);
}

export async function fingerprintSupabaseConfig(directory) {
  const script = await readFile(resolve(directory, 'app-config.js'));
  const filename = `app-config-${createHash('sha256').update(script).digest('hex').slice(0, 16)}.js`;
  const index = resolve(directory, 'index.html');
  const shell = await readFile(index, 'utf8');
  const entry = /\bsrc="\/app-config(?:-[a-f0-9]{16})?\.js"/g;
  if ([...shell.matchAll(entry)].length !== 1) throw new Error('Missing unique public account configuration entry.');
  await writeFile(resolve(directory, filename), script);
  await writeFile(index, shell.replace(entry, `src="/${filename}"`));
  return filename;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const enabled = await buildSupabaseConfig(process.env, resolve(import.meta.dirname, '../public/app-config.js'));
  console.log(
    enabled ?
      'Public Supabase account configuration prepared.'
    : 'Account service disabled; local creation remains available.'
  );
}
