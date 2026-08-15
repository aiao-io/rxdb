import { describe, expect, it } from 'vitest';

import { DEVTOOLS_PROVIDER_OPERATIONS } from '../../provider/descriptor.js';
import type { DevToolsProviderDescriptor, DevToolsProviderDomain } from '../../provider/descriptor.js';
import { DEVTOOLS_V2_MESSAGE_TYPES } from '../../v2/wire.js';
import {
  DEVTOOLS_MESSAGE_REQUIRED_CAPABILITY,
  DEVTOOLS_OPERATION_REQUIRED_CAPABILITY,
  authorizeMessage,
  authorizeOperation,
  isMutatingOperation
} from '../../v2/authorization.js';
import type { DevToolsAuthorizationInput } from '../../v2/authorization.js';
import type { DevToolsCapability } from '../../types.js';

const CAPABILITIES: readonly DevToolsCapability[] = ['none', 'readonly', 'full'];

function descriptor(
  domain: DevToolsProviderDomain,
  operations: readonly string[]
): DevToolsProviderDescriptor {
  const kind = domain === 'database' ? 'rxdb' : 'opfs';
  return {
    domain,
    version: 1,
    kind,
    operations: operations as DevToolsProviderDescriptor['operations'],
    runtime: 'browser',
    limits: { maxTransferBytes: 1_048_576 }
  };
}

/** 三个领域全声明、全操作可用的「最宽」descriptor 集合。 */
function fullDescriptors(): readonly DevToolsProviderDescriptor[] {
  return [
    descriptor('database', DEVTOOLS_PROVIDER_OPERATIONS.database),
    descriptor('files', DEVTOOLS_PROVIDER_OPERATIONS.files),
    descriptor('settings', DEVTOOLS_PROVIDER_OPERATIONS.settings)
  ];
}

function input(overrides: Partial<DevToolsAuthorizationInput> = {}): DevToolsAuthorizationInput {
  return {
    capability: 'full',
    mutationPolicy: 'allow',
    descriptors: fullDescriptors(),
    domain: 'files',
    operation: 'list',
    ...overrides
  };
}

describe('three-layer authorization', () => {
  it('MUST register every message type and every provider operation', () => {
    // `satisfies` 已经在编译期挡住漏登记；这条测试盯的是运行期目录与类型不同步的情形。
    expect(Object.keys(DEVTOOLS_MESSAGE_REQUIRED_CAPABILITY).sort()).toEqual([...DEVTOOLS_V2_MESSAGE_TYPES].sort());

    for (const domain of ['database', 'files', 'settings'] as const) {
      const registered = Object.keys(DEVTOOLS_OPERATION_REQUIRED_CAPABILITY[domain]).sort();
      expect(registered).toEqual([...DEVTOOLS_PROVIDER_OPERATIONS[domain]].sort());
    }
  });

  it('MUST let the none tier carry only lifecycle messages', () => {
    const atNone = DEVTOOLS_V2_MESSAGE_TYPES.filter(type => authorizeMessage(type, 'none'));

    // 业务数据一条都不许出门：REQUEST / RESPONSE / EVENT / TRANSFER_* 全部被挡在 none 之外。
    expect(atNone).toEqual([
      'PROTOCOL_HELLO',
      'HANDSHAKE',
      'HANDSHAKE_ACK',
      'DISCONNECT',
      'PING',
      'PONG',
      'CLEAR_EVENT_BUFFER',
      'ERROR'
    ]);
  });

  it('MUST derive the mutation set from the full tier instead of a second list', () => {
    // 两张必须保持一致的清单迟早会漂移；这里只有一张。
    expect(isMutatingOperation('database', 'delete-branch')).toBe(true);
    expect(isMutatingOperation('files', 'upload')).toBe(true);
    expect(isMutatingOperation('settings', 'clear')).toBe(true);
    expect(isMutatingOperation('files', 'download')).toBe(false);
    expect(isMutatingOperation('settings', 'export')).toBe(false);
  });

  it('MUST silently drop a capability-denied operation, never reveal it structurally', () => {
    // 结构化拒绝会让 none 档连接把 descriptor 目录枚举出来——静默丢弃才是零泄漏。
    expect(authorizeOperation(input({ capability: 'none' }))).toEqual({ outcome: 'silent-drop' });
    expect(authorizeOperation(input({ capability: 'readonly', operation: 'upload' }))).toEqual({
      outcome: 'silent-drop'
    });
  });

  it('MUST check capability before the descriptor so a denial leaks nothing', () => {
    // descriptor 缺席 + capability 不足：两条拒绝路径同时成立时必须先走静默那条。
    const decision = authorizeOperation(input({ capability: 'none', descriptors: [] }));
    expect(decision).toEqual({ outcome: 'silent-drop' });
  });

  it('MUST answer provider_unsupported for a recognised request the provider does not offer', () => {
    const missingDomain = authorizeOperation(input({ descriptors: [] }));
    const missingOperation = authorizeOperation(input({ descriptors: [descriptor('files', ['list'])], operation: 'download' }));

    for (const decision of [missingDomain, missingOperation]) {
      expect(decision).toEqual({
        outcome: 'rejected',
        error: { code: 'provider_unsupported', retryable: false }
      });
    }
  });

  it('MUST answer provider_unsupported for an unavailable provider even when it lists no operations', () => {
    const unavailable: DevToolsProviderDescriptor = {
      domain: 'files',
      version: 1,
      kind: 'unavailable',
      operations: [],
      runtime: 'browser',
      limits: { maxTransferBytes: 0 },
      reason: 'not_configured'
    };

    expect(authorizeOperation(input({ descriptors: [unavailable] }))).toEqual({
      outcome: 'rejected',
      error: { code: 'provider_unsupported', retryable: false }
    });
  });

  it('MUST require mutation opt-in on top of the full tier', () => {
    // capability 与 policy 是两个独立开关：full 不隐含「允许写」。
    expect(authorizeOperation(input({ operation: 'upload', mutationPolicy: 'omit' }))).toEqual({
      outcome: 'rejected',
      error: { code: 'provider_unsupported', retryable: false }
    });
    expect(authorizeOperation(input({ operation: 'upload', mutationPolicy: 'allow' }))).toEqual({ outcome: 'allowed' });
    // 只读操作不受 policy 影响。
    expect(authorizeOperation(input({ operation: 'download', mutationPolicy: 'omit' }))).toEqual({ outcome: 'allowed' });
  });

  it('MUST fail closed for an operation nobody registered', () => {
    // 类型系统挡不住 wire 上的任意字符串；未登记的操作按最严处理，绝不默认放行。
    expect(authorizeOperation(input({ operation: 'rm-rf' }))).toEqual({ outcome: 'silent-drop' });
  });

  it('MUST hold the whole capability × operation matrix', () => {
    const expectations: readonly (readonly [DevToolsCapability, string, string])[] = [
      ['none', 'list', 'silent-drop'],
      ['none', 'upload', 'silent-drop'],
      ['readonly', 'list', 'allowed'],
      ['readonly', 'upload', 'silent-drop'],
      ['full', 'list', 'allowed'],
      ['full', 'upload', 'allowed']
    ];

    for (const [capability, operation, outcome] of expectations) {
      expect(authorizeOperation(input({ capability, operation })).outcome).toBe(outcome);
    }
  });

  it('MUST ignore what the wire claims and honour only the local configuration', () => {
    // descriptor 里回显的 capability 是告知，不是权限输入——授权函数根本不读它。
    const boastful = { ...descriptor('files', DEVTOOLS_PROVIDER_OPERATIONS.files), capability: 'full' };
    const decision = authorizeOperation(
      input({ capability: 'readonly', operation: 'delete', descriptors: [boastful as DevToolsProviderDescriptor] })
    );

    expect(decision).toEqual({ outcome: 'silent-drop' });
  });

  it('MUST accept every readonly operation at the readonly tier across all domains', () => {
    for (const domain of ['database', 'files', 'settings'] as const) {
      for (const operation of DEVTOOLS_PROVIDER_OPERATIONS[domain]) {
        const decision = authorizeOperation(input({ capability: 'readonly', domain, operation, mutationPolicy: 'omit' }));
        const expected = isMutatingOperation(domain, operation) ? 'silent-drop' : 'allowed';
        expect(decision.outcome, `${domain}.${operation}`).toBe(expected);
      }
    }
  });

  it('MUST gate message types by rank, not by an ad-hoc allow list', () => {
    for (const capability of CAPABILITIES) {
      for (const type of DEVTOOLS_V2_MESSAGE_TYPES) {
        const required = DEVTOOLS_MESSAGE_REQUIRED_CAPABILITY[type];
        const allowed = capability === 'full' || required === 'none' || required === capability;
        expect(authorizeMessage(type, capability), `${type}@${capability}`).toBe(allowed);
      }
    }
  });
});
