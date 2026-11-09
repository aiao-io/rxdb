// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handleReportRequest, parseReportInput, type ReportDirectory } from './reports';

const HASH = 'a'.repeat(64);
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const directoryWith = (overrides: Partial<ReportDirectory> = {}): ReportDirectory => ({
  submit: vi.fn(async () => ({ created: true })),
  listOpen: vi.fn(async () => []),
  resolve: vi.fn(async () => undefined),
  hasServerCopy: vi.fn(async () => true),
  ...overrides
});

const request = (method: string, body: unknown, token = 'good') =>
  new Request('http://worker.test/api/reports', {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

const depsWith = (directory: ReportDirectory) => ({
  directory,
  verifyUser: async (token: string) => (token === 'good' ? { id: USER, email: 'a@example.com' } : null)
});

describe('parseReportInput', () => {
  it('接受文件目标（contentHash）与账号目标（accountId），分类必须在表内', () => {
    expect(
      parseReportInput({
        target: { contentHash: HASH, sourceUrl: `/api/files/enc/${'e'.repeat(64)}` },
        category: 'malware'
      })
    ).toEqual({
      targetHash: HASH,
      targetUser: null,
      sourceUrl: `/api/files/enc/${'e'.repeat(64)}`,
      category: 'malware'
    });
    expect(parseReportInput({ target: { accountId: USER }, category: 'phishing' })).toEqual({
      targetHash: null,
      targetUser: USER,
      sourceUrl: null,
      category: 'phishing'
    });
  });

  it.each([
    [{ category: 'malware' }],
    [{ target: {}, category: 'malware' }],
    [{ target: { contentHash: HASH, accountId: USER }, category: 'malware' }],
    [{ target: { contentHash: HASH, sourceUrl: 'https://evil.example/x' }, category: 'malware' }],
    [{ target: { accountId: USER, sourceUrl: '/api/files/enc/abc' }, category: 'malware' }],
    [{ target: { contentHash: 'not-a-hash' }, category: 'malware' }],
    [{ target: { accountId: 'not-a-uuid' }, category: 'malware' }],
    [{ target: { contentHash: HASH }, category: 'spam' }],
    ['not-an-object']
  ])('拒绝结构或取值不合法的输入 %#', input => {
    expect(parseReportInput(input)).toBeNull();
  });
});

describe('handleReportRequest', () => {
  it('未认证或被伪造令牌时 401', async () => {
    const response = await handleReportRequest(
      request('POST', { target: { contentHash: HASH }, category: 'other' }, 'bad'),
      depsWith(directoryWith())
    );
    expect(response.status).toBe(401);
  });

  it('提交合法举报：只把目标标识、分类与举报人交给目录', async () => {
    const directory = directoryWith();
    const response = await handleReportRequest(
      request('POST', { target: { contentHash: HASH }, category: 'malware' }),
      depsWith(directory)
    );
    expect(response.status).toBe(201);
    expect(directory.submit).toHaveBeenCalledWith({
      targetHash: HASH,
      targetUser: null,
      sourceUrl: null,
      category: 'malware',
      reporterUser: USER
    });
  });

  it('rejects a ciphertext URL that is not published for the reported content', async () => {
    const directory = directoryWith({ hasServerCopy: vi.fn(async () => false) });
    const response = await handleReportRequest(
      request('POST', {
        target: { contentHash: HASH, sourceUrl: `/api/files/enc/${'e'.repeat(64)}` },
        category: 'malware'
      }),
      depsWith(directory)
    );
    expect(response.status).toBe(400);
    expect(directory.submit).not.toHaveBeenCalled();
  });

  it('同一举报人重复举报同一目标：200 且不再新建', async () => {
    const directory = directoryWith({ submit: vi.fn(async () => ({ created: false })) });
    const response = await handleReportRequest(
      request('POST', { target: { accountId: OTHER }, category: 'harassment' }),
      depsWith(directory)
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ created: false });
  });

  it('只接受 POST', async () => {
    const response = await handleReportRequest(
      new Request('http://worker.test/api/reports', { method: 'GET' }),
      depsWith(directoryWith())
    );
    expect(response.status).toBe(405);
  });
});
