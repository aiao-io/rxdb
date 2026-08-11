import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const auditScript = join(process.cwd(), 'scripts/audit-build-credentials.mjs');
const temporaryRoots: string[] = [];

function encodeJwtPart(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createJwt(role: string): string {
  return `${encodeJwtPart({ alg: 'HS256', typ: 'JWT' })}.${encodeJwtPart({ role })}.${'s'.repeat(32)}`;
}

function fingerprint(credential: string): string {
  return createHash('sha256').update(credential).digest('hex');
}

async function createArtifact(relativePath: string, contents: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'supabase-credential-audit-'));
  const artifactPath = join(root, relativePath);
  temporaryRoots.push(root);
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, contents);
  return root;
}

function runAudit(root: string) {
  return spawnSync(process.execPath, [auditScript, root], { encoding: 'utf8' });
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { force: true, recursive: true })));
});

describe('production build credential audit', () => {
  const forbiddenFixtures = [
    {
      credential: `sb_secret_${'a'.repeat(32)}`,
      file: 'assets/main.js',
      name: 'secret key'
    },
    {
      credential: createJwt('service_role'),
      file: 'index.html',
      name: 'service-role JWT'
    },
    {
      credential: createJwt('authenticated'),
      file: 'assets/chunk.mjs',
      name: 'non-anon JWT'
    },
    {
      credential: createJwt('postgres'),
      file: 'assets/main.js.map',
      name: 'credential in a sourcemap'
    }
  ];

  it.each(forbiddenFixtures)('rejects $name without echoing it', async ({ credential, file }) => {
    const contents =
      file.endsWith('.map') ?
        JSON.stringify({ sourcesContent: [`const credential = '${credential}'`], version: 3 })
      : `<script>globalThis.credential = '${credential}'</script>`;
    const root = await createArtifact(file, contents);

    const result = runAudit(root);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe(`${file} sha256:${fingerprint(credential)}`);
    expect(result.stderr).not.toContain(credential);
  });

  it.each([
    { credential: `sb_publishable_${'p'.repeat(32)}`, name: 'publishable key' },
    { credential: createJwt('anon'), name: 'anon-role JWT' }
  ])('allows $name', async ({ credential }) => {
    const root = await createArtifact('assets/main.cjs', `globalThis.credential = '${credential}'`);

    const result = runAudit(root);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Credential audit passed');
  });
});
