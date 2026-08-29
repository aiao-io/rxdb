import { describe, expect, it, vi } from 'vitest';
import { isOpfsRequest, type OpfsRequest, validateOpfsName, withOpfsRequestId } from './opfs';

describe('validateOpfsName', () => {
  it.each(['', '.', '..', 'a/b', 'a\\b', 'a\0b'])('rejects unsafe name %j', name => {
    expect(() => validateOpfsName(name)).toThrow();
  });

  it('preserves a valid name', () => {
    expect(validateOpfsName('data.sqlite')).toBe('data.sqlite');
  });
});

describe('isOpfsRequest', () => {
  it('accepts a supported request with an id', () => {
    expect(isOpfsRequest({ requestId: '1', message: 'uploadFile' })).toBe(true);
  });

  it.each([null, [], { requestId: '', message: 'uploadFile' }, { requestId: '1', message: 'destroyEverything' }])(
    'rejects malformed or unsupported input',
    value => {
      expect(isOpfsRequest(value)).toBe(false);
    }
  );
});

describe('withOpfsRequestId', () => {
  it('returns a matching response', async () => {
    const send = vi.fn(async (request: OpfsRequest) => ({ requestId: request.requestId, result: 'ok' as const }));

    await expect(withOpfsRequestId({ message: 'getDirectoryStructure' }, send, () => 'expected')).resolves.toEqual({
      requestId: 'expected',
      result: 'ok'
    });
  });

  it('accepts only the matching response', async () => {
    const send = vi.fn(async () => ({ requestId: 'wrong', result: 'ok' }) as never);

    await expect(withOpfsRequestId({ message: 'getDirectoryStructure' }, send, () => 'expected')).rejects.toThrow(
      'OPFS 响应 requestId 不匹配'
    );
  });
});
