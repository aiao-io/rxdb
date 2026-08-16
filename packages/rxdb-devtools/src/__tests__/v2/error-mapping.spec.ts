import { describe, expect, it } from 'vitest';

import { DEVTOOLS_PROVIDER_ERROR_CODES } from '../../v2/errors.js';
import type { DevToolsProviderErrorCode } from '../../v2/errors.js';
import { DEVTOOLS_PROVIDER_ERROR_RETRYABLE, mapPlatformError } from '../../v2/error-mapping.js';
import type { DevToolsErrorOrigin } from '../../v2/error-mapping.js';

/** 构造一个带 `name` 的类 DOMException 值。 */
function domError(name: string): unknown {
  return { name, message: 'failed to open /Users/alice/Library/opfs/db.sqlite' };
}

/** 构造一个带 `code` 的类 Node 错误。 */
function nodeError(code: string): unknown {
  return { name: 'Error', code, message: `ENOENT: no such file, open '/var/app/data/notes.db'` };
}

/** Tauri 命令回传的 Rust 错误形状。 */
function rustError(kind: string): unknown {
  return { kind, message: 'std::io::Error at src/fs/mod.rs:214' };
}

/** 三端「同一件事」的代表性错误。 */
const EQUIVALENTS: readonly (readonly [DevToolsProviderErrorCode, string, string, string])[] = [
  ['resource_not_found', 'NotFoundError', 'ENOENT', 'NotFound'],
  ['permission_denied', 'NotAllowedError', 'EACCES', 'PermissionDenied'],
  ['resource_conflict', 'InvalidModificationError', 'EEXIST', 'AlreadyExists'],
  ['storage_quota_exceeded', 'QuotaExceededError', 'ENOSPC', 'StorageFull'],
  ['invalid_path', 'TypeMismatchError', 'ENAMETOOLONG', 'InvalidFilename'],
  ['provider_unavailable', 'InvalidStateError', 'ENODEV', 'NotConnected']
];

describe('platform error mapping', () => {
  it.each(EQUIVALENTS)('MUST map the %s case identically on all three platforms', (expected, dom, node, rust) => {
    const payloads = [
      mapPlatformError('dom', domError(dom)),
      mapPlatformError('node', nodeError(node)),
      mapPlatformError('rust', rustError(rust))
    ];

    for (const payload of payloads) expect(payload.code).toBe(expected);
    // 同一个码在三端的 `retryable` 也必须一致——否则 panel 的重试策略随平台漂移。
    expect(new Set(payloads.map(payload => payload.retryable)).size).toBe(1);
  });

  it('MUST read only its own origin discriminator', () => {
    // Node 错误的 `name` 恰好像个 DOMException 时，不得被当成 not-found。
    expect(mapPlatformError('node', { name: 'NotFoundError', message: 'x' }).code).toBe('operation_failed');
    // 反过来同理：DOM 侧不看 `code`。
    expect(mapPlatformError('dom', { code: 'ENOENT', message: 'x' }).code).toBe('operation_failed');
  });

  it('MUST accept a bare string as the rust discriminator', () => {
    expect(mapPlatformError('rust', 'PermissionDenied').code).toBe('permission_denied');
  });

  it.each([
    ['dom', domError('SomeBrandNewError')],
    ['node', nodeError('EWEIRD')],
    ['rust', rustError('Uncategorized')],
    ['dom', 'boom'],
    ['node', null],
    ['rust', undefined],
    ['dom', 42]
  ] as const)('MUST fall back to operation_failed for an unclassifiable %s value', (origin, error) => {
    expect(mapPlatformError(origin as DevToolsErrorOrigin, error)).toEqual({
      code: 'operation_failed',
      retryable: false
    });
  });

  it('MUST NOT forward any platform message', () => {
    // 路径、SQL、栈帧与原始平台码全都只存在于入参里；出参连 `message` 这个通道都没有。
    const leaky = {
      name: 'NotFoundError',
      code: 'SQLITE_CANTOPEN',
      message: "no such file: /Users/alice/db.sqlite; SELECT * FROM users WHERE token='s3cr3t'",
      stack: 'at open (/Users/alice/app/main.js:12:5)'
    };

    expect(mapPlatformError('dom', leaky)).toEqual({ code: 'resource_not_found', retryable: false });
  });

  it('MUST take retryable from one shared table', () => {
    for (const [expected, dom] of EQUIVALENTS.map(entry => [entry[0], entry[1]] as const)) {
      expect(mapPlatformError('dom', domError(dom)).retryable).toBe(DEVTOOLS_PROVIDER_ERROR_RETRYABLE[expected]);
    }
  });

  it('MUST classify every provider error code as retryable or not', () => {
    expect(Object.keys(DEVTOOLS_PROVIDER_ERROR_RETRYABLE).sort()).toEqual([...DEVTOOLS_PROVIDER_ERROR_CODES].sort());
  });

  it('MUST mark only genuinely waitable codes retryable', () => {
    const retryable = DEVTOOLS_PROVIDER_ERROR_CODES.filter(code => DEVTOOLS_PROVIDER_ERROR_RETRYABLE[code]);

    // 配额、冲突与非法路径都不是「等一会儿就好」——把它们标成可重试会诱导 panel 死循环。
    expect([...retryable].sort()).toEqual(['provider_unavailable', 'snapshot_busy']);
  });
});
