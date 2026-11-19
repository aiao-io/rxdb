import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { findLocalDevelopmentCredentials } from '../trigger/trigger-local.mjs';
import { productRoot } from '../supabase/supabase-local.mjs';

const defaults = {
  devVarsFile: resolve(productRoot, 'apps/api/.dev.vars'),
  triggerEnvFile: resolve(productRoot, 'infra/trigger/.env')
};
const LOCAL_TRIGGER_URL = 'http://127.0.0.1:8030';
const DEVELOPMENT_KEY = /^tr_dev_(?:sk_)?[A-Za-z0-9]+$/;
const PROJECT_REF = /^proj_[a-z0-9]+$/;

async function readOptional(file) {
  return readFile(file, 'utf8').catch(error => (error.code === 'ENOENT' ? '' : Promise.reject(error)));
}

function setEnvValues(source, values) {
  const lines = source.split(/\r?\n/);
  const entries = new Map(Object.entries(values));
  const updated = new Set();
  const next = lines.map(line => {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!match || !entries.has(match[1])) return line;
    const [name, value] = [match[1], entries.get(match[1])];
    updated.add(name);
    return `${name}=${JSON.stringify(value)}`;
  });
  while (next.at(-1) === '') next.pop();
  for (const [name, value] of entries) {
    if (!updated.has(name)) next.push(`${name}=${JSON.stringify(value)}`);
  }
  return `${next.join('\n')}\n`;
}

function configuredProjectRef(env, source) {
  return env.TRIGGER_PROJECT_REF?.trim() || parseEnv(source).TRIGGER_PROJECT_REF?.trim() || '';
}

function localTriggerUrl(apiUrl) {
  if (!apiUrl) return LOCAL_TRIGGER_URL;
  try {
    const url = new URL(apiUrl);
    return ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '8030';
  } catch {
    return false;
  }
}

async function writePrivate(file, content) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content, { mode: 0o600 });
  await chmod(file, 0o600);
}

/** 从本地 Trigger 实例恢复 Development key，供 Worker 和 trigger dev 共用。 */
export async function recoverLocalAgentConfig({
  devVarsFile = defaults.devVarsFile,
  triggerEnvFile = defaults.triggerEnvFile,
  env = process.env,
  findCredentials = findLocalDevelopmentCredentials
} = {}) {
  const [devVarsSource, triggerEnvSource] = await Promise.all([
    readOptional(devVarsFile),
    readOptional(triggerEnvFile)
  ]);
  const vars = parseEnv(devVarsSource);
  if (vars.TRIGGER_SECRET_KEY?.trim()) return { status: 'already-configured' };
  if (!localTriggerUrl(vars.TRIGGER_API_URL?.trim())) return { status: 'not-local' };

  const projectRef = configuredProjectRef(env, triggerEnvSource);
  let credentials;
  try {
    credentials = await findCredentials();
  } catch {
    return { status: 'unavailable' };
  }
  const candidates = credentials.filter(
    candidate => DEVELOPMENT_KEY.test(candidate.secretKey) && PROJECT_REF.test(candidate.projectRef)
  );
  const matches = projectRef ? candidates.filter(candidate => candidate.projectRef === projectRef) : candidates;
  if (matches.length === 0) return { status: 'not-found' };
  if (matches.length > 1)
    throw new Error('本地 Trigger 实例存在多个 Development key，不能自动猜项目；请在 infra/trigger/.env 配置 TRIGGER_PROJECT_REF。');

  const [credential] = matches;
  const apiUrl = vars.TRIGGER_API_URL?.trim() || LOCAL_TRIGGER_URL;
  await writePrivate(
    devVarsFile,
    setEnvValues(devVarsSource, { TRIGGER_API_URL: apiUrl, TRIGGER_SECRET_KEY: credential.secretKey })
  );
  await writePrivate(triggerEnvFile, setEnvValues(triggerEnvSource, { TRIGGER_PROJECT_REF: credential.projectRef }));
  return { status: 'recovered', projectRef: credential.projectRef };
}
