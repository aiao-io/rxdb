import { describe, expect, it } from 'vitest';

import {
  DEVTOOLS_PROVIDER_DOMAINS,
  DEVTOOLS_PROVIDER_KINDS,
  DEVTOOLS_PROVIDER_OPERATIONS,
  DEVTOOLS_PROVIDER_RUNTIMES,
  DEVTOOLS_UNAVAILABLE_REASONS,
  isDevToolsProviderDescriptor,
  isDevToolsProviderDescriptorSet
} from '../../provider/descriptor.js';
import type { DevToolsProviderDescriptor } from '../../provider/descriptor.js';

const filesDescriptor = (
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> => ({
  domain: 'files',
  version: 1,
  kind: 'opfs',
  operations: ['list', 'download', 'upload', 'create-directory', 'delete'],
  runtime: 'browser',
  limits: { maxTransferBytes: 52_428_800 },
  ...overrides
});

const databaseDescriptor: DevToolsProviderDescriptor = {
  domain: 'database',
  version: 1,
  kind: 'rxdb',
  operations: ['inspect', 'query', 'events', 'get-branches', 'switch-branch', 'create-branch', 'delete-branch'],
  runtime: 'browser',
  limits: { maxTransferBytes: 0 }
};

const settingsDescriptor: DevToolsProviderDescriptor = {
  domain: 'settings',
  version: 1,
  kind: 'idb',
  operations: ['clear', 'export'],
  runtime: 'browser',
  limits: { maxTransferBytes: 0 }
};

describe('provider descriptor catalogues', () => {
  it('MUST freeze the three domains and three runtimes', () => {
    expect([...DEVTOOLS_PROVIDER_DOMAINS]).toEqual(['database', 'files', 'settings']);
    expect([...DEVTOOLS_PROVIDER_RUNTIMES]).toEqual(['browser', 'electron', 'tauri']);
  });

  it('MUST freeze the kinds allowed per domain', () => {
    expect([...DEVTOOLS_PROVIDER_KINDS.database]).toEqual(['rxdb', 'unavailable']);
    expect([...DEVTOOLS_PROVIDER_KINDS.files]).toEqual(['opfs', 'native-files', 'unavailable']);
    expect([...DEVTOOLS_PROVIDER_KINDS.settings]).toEqual(['opfs', 'idb', 'sqlite', 'unavailable']);
  });

  it('MUST freeze the operation order per domain', () => {
    expect([...DEVTOOLS_PROVIDER_OPERATIONS.database]).toEqual([
      'inspect',
      'query',
      'events',
      'get-branches',
      'switch-branch',
      'create-branch',
      'delete-branch'
    ]);
    expect([...DEVTOOLS_PROVIDER_OPERATIONS.files]).toEqual([
      'list',
      'download',
      'upload',
      'create-directory',
      'delete'
    ]);
    expect([...DEVTOOLS_PROVIDER_OPERATIONS.settings]).toEqual(['clear', 'export']);
  });

  it('MUST expose a shared, non-empty unavailable reason catalogue', () => {
    expect(DEVTOOLS_UNAVAILABLE_REASONS.length).toBeGreaterThan(0);
    expect(new Set(DEVTOOLS_UNAVAILABLE_REASONS).size).toBe(DEVTOOLS_UNAVAILABLE_REASONS.length);
  });
});

describe('isDevToolsProviderDescriptor', () => {
  it('MUST accept a well-formed descriptor for each domain', () => {
    expect(isDevToolsProviderDescriptor(filesDescriptor())).toBe(true);
    expect(isDevToolsProviderDescriptor(databaseDescriptor)).toBe(true);
    expect(isDevToolsProviderDescriptor(settingsDescriptor)).toBe(true);
  });

  it('MUST accept a subset of operations in protocol order', () => {
    expect(isDevToolsProviderDescriptor(filesDescriptor({ operations: ['list', 'download'] }))).toBe(true);
  });

  it('MUST reject operations that are out of protocol order or duplicated', () => {
    expect(isDevToolsProviderDescriptor(filesDescriptor({ operations: ['download', 'list'] }))).toBe(false);
    expect(isDevToolsProviderDescriptor(filesDescriptor({ operations: ['list', 'list'] }))).toBe(false);
  });

  it('MUST reject operations that belong to another domain', () => {
    expect(isDevToolsProviderDescriptor(filesDescriptor({ operations: ['inspect'] }))).toBe(false);
  });

  it('MUST reject a kind that is not allowed for the domain', () => {
    expect(isDevToolsProviderDescriptor(filesDescriptor({ kind: 'idb' }))).toBe(false);
    expect(isDevToolsProviderDescriptor(filesDescriptor({ kind: 'rxdb' }))).toBe(false);
  });

  it('MUST require unavailable descriptors to carry a shared reason and no operations', () => {
    const base = filesDescriptor({ kind: 'unavailable', operations: [], reason: DEVTOOLS_UNAVAILABLE_REASONS[0] });

    expect(isDevToolsProviderDescriptor(base)).toBe(true);
    expect(isDevToolsProviderDescriptor({ ...base, operations: ['list'] })).toBe(false);
    expect(isDevToolsProviderDescriptor({ ...base, reason: 'because' })).toBe(false);
    expect(isDevToolsProviderDescriptor(filesDescriptor({ kind: 'unavailable', operations: [] }))).toBe(false);
  });

  it('MUST reject a reason on an available descriptor', () => {
    expect(isDevToolsProviderDescriptor(filesDescriptor({ reason: DEVTOOLS_UNAVAILABLE_REASONS[0] }))).toBe(false);
  });

  it('MUST require maxTransferBytes above zero when files declares a transfer operation', () => {
    expect(isDevToolsProviderDescriptor(filesDescriptor({ limits: { maxTransferBytes: 0 } }))).toBe(false);
    expect(
      isDevToolsProviderDescriptor(filesDescriptor({ operations: ['list'], limits: { maxTransferBytes: 0 } }))
    ).toBe(true);
  });

  it('MUST reject out-of-range, fractional and non-numeric maxTransferBytes', () => {
    expect(isDevToolsProviderDescriptor(filesDescriptor({ limits: { maxTransferBytes: -1 } }))).toBe(false);
    expect(isDevToolsProviderDescriptor(filesDescriptor({ limits: { maxTransferBytes: 1.5 } }))).toBe(false);
    expect(isDevToolsProviderDescriptor(filesDescriptor({ limits: { maxTransferBytes: 1_073_741_825 } }))).toBe(false);
    expect(isDevToolsProviderDescriptor(filesDescriptor({ limits: { maxTransferBytes: Number.NaN } }))).toBe(false);
    expect(isDevToolsProviderDescriptor(filesDescriptor({ limits: {} }))).toBe(false);
    expect(isDevToolsProviderDescriptor(filesDescriptor({ limits: { maxTransferBytes: 1, extra: 1 } }))).toBe(false);
  });

  it('MUST pin the descriptor version at 1', () => {
    expect(isDevToolsProviderDescriptor(filesDescriptor({ version: 2 }))).toBe(false);
    expect(isDevToolsProviderDescriptor(filesDescriptor({ version: '1' }))).toBe(false);
  });

  it('MUST reject unknown domains, unknown runtimes, extra keys and missing keys', () => {
    expect(isDevToolsProviderDescriptor(filesDescriptor({ domain: 'network' }))).toBe(false);
    expect(isDevToolsProviderDescriptor(filesDescriptor({ runtime: 'node' }))).toBe(false);
    expect(isDevToolsProviderDescriptor(filesDescriptor({ extra: true }))).toBe(false);
    expect(isDevToolsProviderDescriptor({ ...filesDescriptor(), limits: undefined })).toBe(false);
    expect(isDevToolsProviderDescriptor(null)).toBe(false);
    expect(isDevToolsProviderDescriptor([filesDescriptor()])).toBe(false);
  });

  it('MUST accept the same kind under every runtime', () => {
    // runtime 只用于显示。相同 kind 在三个 runtime 上跑同一份 conformance，
    // 任何按 runtime 分叉的行为都会让「同 kind 同语义」这条契约失效。
    for (const runtime of DEVTOOLS_PROVIDER_RUNTIMES) {
      expect(isDevToolsProviderDescriptor(filesDescriptor({ kind: 'native-files', runtime }))).toBe(true);
    }
  });
});

describe('isDevToolsProviderDescriptorSet', () => {
  it('MUST accept zero, one or one-per-domain descriptors', () => {
    expect(isDevToolsProviderDescriptorSet([])).toBe(true);
    expect(isDevToolsProviderDescriptorSet([databaseDescriptor])).toBe(true);
    expect(isDevToolsProviderDescriptorSet([databaseDescriptor, filesDescriptor(), settingsDescriptor])).toBe(true);
  });

  it('MUST reject duplicate domains', () => {
    expect(isDevToolsProviderDescriptorSet([filesDescriptor(), filesDescriptor({ kind: 'native-files' })])).toBe(false);
  });

  it('MUST reject a set containing an invalid descriptor or a non-array', () => {
    expect(isDevToolsProviderDescriptorSet([filesDescriptor({ kind: 'idb' })])).toBe(false);
    expect(isDevToolsProviderDescriptorSet(undefined)).toBe(false);
    expect(isDevToolsProviderDescriptorSet(filesDescriptor())).toBe(false);
  });
});
