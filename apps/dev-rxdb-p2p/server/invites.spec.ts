// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { generateInviteCodes, handleInviteRequest, INVITE_CODE_LENGTH, type InviteDirectory } from './invites';

const USER = '11111111-1111-4111-8111-111111111111';

const directoryWith = (overrides: Partial<InviteDirectory> = {}): InviteDirectory => ({
  activate: vi.fn(async () => true),
  isActivated: vi.fn(async () => false),
  issueCodes: vi.fn(async () => []),
  revoke: vi.fn(async () => true),
<<<<<<< HEAD
=======
  listCodes: vi.fn(async () => []),
>>>>>>> 3e4c88e65fa427160c6e364877d15e3a23260046
  ...overrides
});

const request = (method: string, body?: unknown, token = 'good') =>
  new Request(`http://worker.test/api${method === 'GET' ? '/me' : '/invite'}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

const depsWith = (directory: InviteDirectory, requireActivation = false) => ({
  directory,
  requireActivation,
  verifyUser: async (token: string) => (token === 'good' ? { id: USER, email: 'a@example.com' } : null)
});

describe('generateInviteCodes', () => {
  it('生成的码长度与字母表符合约定，一次一批互不重复', () => {
    let seed = 42;
    const lcg = (): number => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const codes = generateInviteCodes(5, lcg);
    expect(codes).toHaveLength(5);
    for (const code of codes) {
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      expect(code).toMatch(/^[A-Za-z0-9]+$/);
    }
    expect(new Set(codes).size).toBe(5);
  });
});

describe('handleInviteRequest', () => {
  it('GET /api/me 报告激活状态；未认证 401', async () => {
    const directory = directoryWith({ isActivated: vi.fn(async () => true) });
    const response = await handleInviteRequest(request('GET'), depsWith(directory, true));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activated: true, activationRequired: true });
    expect(directory.isActivated).toHaveBeenCalledWith(USER);

    const denied = await handleInviteRequest(request('GET', undefined, 'bad'), depsWith(directoryWith()));
    expect(denied.status).toBe(401);
  });

  it('未要求激活的部署恒报已激活，不查数据库', async () => {
    const directory = directoryWith({ isActivated: vi.fn(async () => false) });
    const response = await handleInviteRequest(request('GET'), depsWith(directory, false));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activated: true, activationRequired: false });
    expect(directory.isActivated).not.toHaveBeenCalled();
  });

  it('POST /api/invite 用有效码激活：200 且把码与用户交给目录', async () => {
    const directory = directoryWith({ activate: vi.fn(async () => true) });
    const response = await handleInviteRequest(request('POST', { code: 'valid-code-123' }), depsWith(directory));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activated: true });
    expect(directory.activate).toHaveBeenCalledWith('valid-code-123', USER);
  });

  it('码已用、已作废或不存在：409 且目录的 activate 结果为 false', async () => {
    const directory = directoryWith({ activate: vi.fn(async () => false) });
    const response = await handleInviteRequest(request('POST', { code: 'revoked-code' }), depsWith(directory));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ activated: false });
  });

  it('缺少码或码不合法：400，不打扰目录', async () => {
    const directory = directoryWith();
    const missing = await handleInviteRequest(request('POST', {}), depsWith(directory));
    expect(missing.status).toBe(400);
    const malformed = await handleInviteRequest(request('POST', { code: 'x'.repeat(3) }), depsWith(directory));
    expect(malformed.status).toBe(400);
    expect(directory.activate).not.toHaveBeenCalled();
  });
});
