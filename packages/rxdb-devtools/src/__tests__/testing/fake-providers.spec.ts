import { describe, expect, it } from 'vitest';

import {
  DEVTOOLS_PROVIDER_KINDS,
  DEVTOOLS_PROVIDER_OPERATIONS,
  isDevToolsProviderDescriptorSet
} from '../../provider/descriptor.js';
import type { DevToolsProviderDomain, DevToolsProviderKind } from '../../provider/descriptor.js';
import { createFakeProviders } from '../../testing/fake-providers.js';
import type { DevToolsFakeProviderKinds } from '../../testing/fake-providers.js';

const DOMAINS: readonly DevToolsProviderDomain[] = ['database', 'files', 'settings'];

function only(domain: DevToolsProviderDomain, kind: DevToolsProviderKind): DevToolsFakeProviderKinds {
  const kinds: DevToolsFakeProviderKinds = {};
  kinds[domain] = kind;
  return kinds;
}

describe('fake provider descriptors', () => {
  it('MUST emit a descriptor set the exact guard accepts', () => {
    const set = createFakeProviders();

    expect(isDevToolsProviderDescriptorSet(set.descriptors)).toBe(true);
    expect(set.descriptors.map(descriptor => descriptor.domain)).toEqual(DOMAINS);
  });

  it.each(['browser', 'electron', 'tauri'] as const)(
    'MUST keep operations identical across runtimes for the same kind (%s)',
    runtime => {
      const baseline = createFakeProviders({ runtime: 'browser' });
      const other = createFakeProviders({ runtime });

      // 同 kind 只因 runtime 不同就给出不同能力，正是共享契约要禁止的分叉。
      expect(other.descriptors.map(descriptor => descriptor.operations)).toEqual(
        baseline.descriptors.map(descriptor => descriptor.operations)
      );
      expect(other.descriptors.every(descriptor => descriptor.runtime === runtime)).toBe(true);
    }
  );

  it.each(DOMAINS)('MUST declare the full protocol operation list for an available %s kind', domain => {
    const descriptor = createFakeProviders().descriptors.find(entry => entry.domain === domain);

    expect(descriptor?.operations).toEqual(DEVTOOLS_PROVIDER_OPERATIONS[domain]);
  });

  it.each(DOMAINS)('MUST declare no operations and a reason when %s is unavailable', domain => {
    const set = createFakeProviders({ kinds: only(domain, 'unavailable') });
    const descriptor = set.descriptors.find(entry => entry.domain === domain);

    expect(descriptor?.operations).toEqual([]);
    expect(descriptor?.reason).toBe('not_configured');
    expect(isDevToolsProviderDescriptorSet(set.descriptors)).toBe(true);
  });

  it('MUST cover every declared kind', () => {
    for (const domain of DOMAINS) {
      for (const kind of DEVTOOLS_PROVIDER_KINDS[domain]) {
        const set = createFakeProviders({ kinds: only(domain, kind) });
        expect(set.descriptors.find(entry => entry.domain === domain)?.kind, `${domain}/${kind}`).toBe(kind);
      }
    }
  });
});

describe('fake provider probes', () => {
  it('MUST start every counter at zero', async () => {
    const { probe } = createFakeProviders();

    expect(probe.operationCalls.size).toBe(0);
    expect(probe.hostReads).toBe(0);
    expect(probe.eventSubscriptions).toBe(0);
    expect(probe.bufferedEvents).toBe(0);
    expect(probe.peakRetainedBytes).toBe(0);
    expect(await probe.temporaryArtifacts()).toEqual([]);
  });

  it('MUST count each invocation under its qualified name', async () => {
    const set = createFakeProviders();

    await set.provider('database').invoke('inspect', {});
    await set.provider('database').invoke('inspect', {});
    await set.provider('files').invoke('list', { path: '/' });

    expect(set.probe.operationCalls.get('database.inspect')).toBe(2);
    expect(set.probe.operationCalls.get('files.list')).toBe(1);
    expect(set.probe.hostReads).toBe(3);
  });

  it('MUST count an event subscription only when events is actually invoked', async () => {
    const set = createFakeProviders();

    expect(set.probe.eventSubscriptions).toBe(0);
    await set.provider('database').invoke('events', {});
    expect(set.probe.eventSubscriptions).toBe(1);
  });
});

describe('fake provider behaviour', () => {
  it('MUST answer export_unsupported without touching the host', async () => {
    const set = createFakeProviders();
    const result = await set.provider('settings').invoke('export', {});

    expect(result).toEqual({ outcome: 'failed', error: { code: 'export_unsupported', retryable: false } });
    // AC#24：provider / OPFS / SQLite / WAL / 应用目录读取次数全为 0。
    expect(set.probe.hostReads).toBe(0);
  });

  it.each(DOMAINS)('MUST answer provider_unavailable for every operation of an unavailable %s', async domain => {
    const set = createFakeProviders({ kinds: only(domain, 'unavailable') });

    for (const operation of DEVTOOLS_PROVIDER_OPERATIONS[domain]) {
      expect(await set.provider(domain).invoke(operation, {})).toEqual({
        outcome: 'failed',
        error: { code: 'provider_unavailable', retryable: true }
      });
    }
    expect(set.probe.hostReads).toBe(0);
  });

  it('MUST reject an operation the domain does not define', async () => {
    const result = await createFakeProviders().provider('files').invoke('teleport', {});

    expect(result).toEqual({ outcome: 'failed', error: { code: 'provider_unsupported', retryable: false } });
  });

  it('MUST run injected platform failures through the shared mapping', async () => {
    const set = createFakeProviders({
      failures: { 'files.list': { origin: 'dom', error: { name: 'NotAllowedError', message: '/private/x' } } }
    });
    const result = await set.provider('files').invoke('list', { path: '/' });

    expect(result).toEqual({ outcome: 'failed', error: { code: 'permission_denied', retryable: false } });
  });

  it('MUST report a conflict when creating a branch twice', async () => {
    const set = createFakeProviders();
    await set.provider('database').invoke('create-branch', { name: 'wip' });

    expect(await set.provider('database').invoke('create-branch', { name: 'wip' })).toEqual({
      outcome: 'failed',
      error: { code: 'resource_conflict', retryable: false }
    });
  });
});

describe('fake chunk sink', () => {
  it('MUST commit only through commit and leave no temporary artifact', async () => {
    const set = createFakeProviders();
    const sink = set.createChunkSink('/uploads/a.bin');

    expect(await set.probe.temporaryArtifacts()).toEqual(['/uploads/a.bin.tmp']);
    sink.write(new Uint8Array(4));
    sink.write(new Uint8Array(6));
    sink.commit();

    expect(await set.probe.temporaryArtifacts()).toEqual([]);
    expect(set.committedFiles()).toEqual([['/uploads/a.bin', 10]]);
  });

  it('MUST discard without committing anything', async () => {
    const set = createFakeProviders();
    const sink = set.createChunkSink('/uploads/b.bin');
    sink.write(new Uint8Array(8));
    sink.discard();

    expect(await set.probe.temporaryArtifacts()).toEqual([]);
    expect(set.committedFiles()).toEqual([]);
  });

  it('MUST be idempotent on commit and discard', async () => {
    const set = createFakeProviders();
    const sink = set.createChunkSink('/uploads/c.bin');
    sink.write(new Uint8Array(2));
    sink.commit();
    sink.commit();
    sink.discard();

    // 已提交的文件不会被一次迟到的 discard 抹掉，重复 commit 也不会算两遍字节。
    expect(set.committedFiles()).toEqual([['/uploads/c.bin', 2]]);
  });

  it('MUST track the peak per-frame residency, not the total', () => {
    const set = createFakeProviders();
    const sink = set.createChunkSink('/uploads/d.bin');
    sink.write(new Uint8Array(1_000));
    sink.write(new Uint8Array(256));
    sink.commit();

    // 整文件驻留会让峰值等于总字节数；逐块处理下它只等于最大的一块。
    expect(set.probe.peakRetainedBytes).toBe(1_000);
  });
});
