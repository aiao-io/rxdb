// @vitest-environment node
/**
 * Worker secrets 的两个生成脚本：`scripts/deploy-secrets.mjs`（线上）与 `scripts/dev-vars.mjs`（本地 `.dev.vars`）。
 * 都按真实用法跑子进程；dev-vars.mjs 把文件写到脚本目录的上一级，所以连同依赖复制到临时目录里跑，不碰本机的 `.dev.vars`。
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTicketIssuer } from './tickets';

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url));

const runScript = (script: string, args: readonly string[], env: Record<string, string>) =>
  spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8' });

describe('deploy-secrets.mjs', () => {
  const SUPABASE = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'anon-key' };
  const deploySecrets = (...args: string[]) => runScript(join(SCRIPTS, 'deploy-secrets.mjs'), args, SUPABASE);

  it('leaves the ticket signing key out unless asked for a new one', () => {
    const result = deploySecrets();

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(SUPABASE);
  });

  it('adds a ticket signing key the Worker accepts when asked for a new one', async () => {
    const result = deploySecrets('--new-ticket-key');

    expect(result.status).toBe(0);
    const secrets = JSON.parse(result.stdout) as Record<string, string>;
    expect(secrets).toMatchObject(SUPABASE);
    await expect(createTicketIssuer(secrets['TICKET_PRIVATE_JWK'] ?? '', Date.now)).resolves.toHaveProperty(
      'publicKey'
    );
  });

  it('refuses an unknown flag instead of quietly keeping the old key', () => {
    const result = deploySecrets('--rotate');

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--new-ticket-key');
  });
});

describe('dev-vars.mjs', () => {
  const STACK = {
    P2P_SUPABASE_URL: 'http://127.0.0.1:54321',
    P2P_SUPABASE_ANON_KEY: 'anon-key',
    P2P_SUPABASE_SERVICE_ROLE_KEY: 'service-key'
  };
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'p2p-dev-vars-'));
    mkdirSync(join(root, 'scripts'));
    for (const name of ['dev-vars.mjs', 'supabase-stack.mjs']) {
      copyFileSync(join(SCRIPTS, name), join(root, 'scripts', name));
    }
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const devVars = (): string => join(root, '.dev.vars');
  const modeOf = (path: string): number => statSync(path).mode & 0o777;
  const writeDevVars = (): void => {
    const result = runScript(join(root, 'scripts', 'dev-vars.mjs'), [], STACK);
    expect(result.status, result.stderr).toBe(0);
  };

  it('creates the file with the signing key readable by its owner only', () => {
    writeDevVars();

    expect(modeOf(devVars())).toBe(0o600);
    expect(readFileSync(devVars(), 'utf8')).toMatch(/^TICKET_PRIVATE_JWK=\{.+\}$/m);
    expect(readdirSync(root).sort()).toEqual(['.dev.vars', 'scripts']);
  });

  it('replaces an existing file in one step, keeping its key and dropping its looser permissions', () => {
    const key = '{"kty":"OKP","crv":"Ed25519","x":"public","d":"private"}';
    writeFileSync(devVars(), `TICKET_PRIVATE_JWK=${key}\n`);
    chmodSync(devVars(), 0o644);
    const before = statSync(devVars()).ino;

    writeDevVars();

    expect(statSync(devVars()).ino).not.toBe(before);
    expect(modeOf(devVars())).toBe(0o600);
    expect(readFileSync(devVars(), 'utf8')).toContain(`TICKET_PRIVATE_JWK=${key}\n`);
    expect(readdirSync(root).sort()).toEqual(['.dev.vars', 'scripts']);
  });
});
