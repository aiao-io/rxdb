// @vitest-environment node
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const script = new URL('../scripts/e2e-admin-user.mjs', import.meta.url);
const servers: Server[] = [];

const listen = async (server: Server): Promise<string> => {
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('expected a TCP server');
  return `http://127.0.0.1:${address.port}`;
};

const provision = (url: string) =>
  execute(process.execPath, [script.pathname], {
    env: {
      P2P_SUPABASE_URL: url,
      P2P_SUPABASE_ANON_KEY: 'test-anon-key',
      P2P_SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      P2P_E2E_ADMIN_EMAIL: 'admin@example.test',
      P2P_E2E_ADMIN_PASSWORD: 'test-password'
    }
  });

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

describe('e2e administrator provisioning', () => {
  it('rejects a remote destination before sending administrator credentials', async () => {
    await expect(provision('https://supabase.example.invalid')).rejects.toMatchObject({
      stderr: expect.stringContaining('e2e administrator requires a loopback Supabase URL')
    });
  });

  it('creates an administrator in the local test stack', async () => {
    const calls: string[] = [];
    const url = await listen(
      createServer((request, response) => {
        calls.push(`${request.method} ${request.url}`);
        expect(request.headers['apikey']).toBe('test-service-key');
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ id: 'test-admin-id' }));
      })
    );

    await expect(provision(url)).resolves.toMatchObject({ stdout: 'test-admin-id\n' });
    expect(calls).toEqual(['POST /auth/v1/admin/users']);
  });

  it.each(['create', 'login'])('does not forward credentials when the %s endpoint redirects', async step => {
    const received: string[] = [];
    const destination = await listen(
      createServer((request, response) => {
        received.push(request.url ?? '');
        response.end(JSON.stringify({ id: 'redirected-admin-id' }));
      })
    );
    const url = await listen(
      createServer((request, response) => {
        if (step === 'login' && request.url === '/auth/v1/admin/users') {
          response.writeHead(422);
          response.end();
          return;
        }
        response.writeHead(302, { location: `${destination}/capture` });
        response.end();
      })
    );

    await expect(provision(url)).rejects.toThrow();
    expect(received).toEqual([]);
  });
});
