import { describe, expect, it } from 'vitest';
import {
  assertRxDBUpgradeClaimable,
  createRxDBActiveWriterLeaseError,
  readRxDBUpgradeGuard,
  readRxDBWriterLease,
  resolveRxDBWriterEpoch,
  RXDB_WRITER_PROTOCOL_VERSION
} from '../../system/writer-lease.js';

describe('writer lease protocol', () => {
  const openGuard = {
    epoch: 4,
    state: 'open',
    minProtocol: RXDB_WRITER_PROTOCOL_VERSION
  } as const;

  it('adopts the current open epoch on first registration', () => {
    expect(resolveRxDBWriterEpoch(openGuard, RXDB_WRITER_PROTOCOL_VERSION)).toBe(4);
  });

  it.each(['open', 'draining', 'migrating', 'failed'] as const)('parses persisted %s guard state', state => {
    expect(readRxDBUpgradeGuard({ ...openGuard, state })).toEqual({ ...openGuard, state });
  });

  it.each([
    [{ ...openGuard, ownerId: null, ownerExpiresAt: null, ownerActive: false }, 'upgrader'],
    [
      {
        ...openGuard,
        state: 'draining',
        ownerId: 'upgrader',
        ownerExpiresAt: 'database timestamp',
        ownerActive: true
      },
      'upgrader'
    ],
    [
      {
        ...openGuard,
        state: 'failed',
        ownerId: 'expired-upgrader',
        ownerExpiresAt: 'database timestamp',
        ownerActive: false
      },
      'new-upgrader'
    ]
  ] as const)('allows a valid upgrade owner claim', (guard, ownerId) => {
    expect(assertRxDBUpgradeClaimable(guard, ownerId, RXDB_WRITER_PROTOCOL_VERSION)).toBe(4);
  });

  it('does not steal a non-expired upgrade owner', () => {
    const guard = {
      ...openGuard,
      state: 'draining',
      ownerId: 'other-upgrader',
      ownerExpiresAt: 'database timestamp',
      ownerActive: true
    };
    expect(() => assertRxDBUpgradeClaimable(guard, 'upgrader', RXDB_WRITER_PROTOCOL_VERSION)).toThrow(
      expect.objectContaining({ code: 'upgrade_owner_active' })
    );
  });

  it.each([
    [
      { ...openGuard, ownerId: null, ownerExpiresAt: null, ownerActive: false },
      '',
      RXDB_WRITER_PROTOCOL_VERSION,
      'writer_guard_invalid'
    ],
    [
      { ...openGuard, ownerId: 'stale-owner', ownerExpiresAt: null, ownerActive: false },
      'upgrader',
      RXDB_WRITER_PROTOCOL_VERSION,
      'writer_guard_invalid'
    ],
    [
      { ...openGuard, state: 'draining', ownerId: null, ownerExpiresAt: null, ownerActive: false },
      'upgrader',
      RXDB_WRITER_PROTOCOL_VERSION,
      'writer_guard_invalid'
    ],
    [
      { ...openGuard, ownerId: null, ownerExpiresAt: null, ownerActive: false },
      'upgrader',
      RXDB_WRITER_PROTOCOL_VERSION + 1,
      'upgrade_protocol_unsupported'
    ]
  ] as const)('rejects an unsafe upgrade claim', (guard, ownerId, protocol, code) => {
    expect(() => assertRxDBUpgradeClaimable(guard, ownerId, protocol)).toThrow(expect.objectContaining({ code }));
  });

  it('returns a stable active-writer migration error', () => {
    expect(createRxDBActiveWriterLeaseError()).toEqual(
      expect.objectContaining({ code: 'upgrade_writer_active', message: expect.stringMatching(/active writer lease/i) })
    );
  });

  it.each([
    [undefined, 'writer_guard_missing'],
    [{ ...openGuard, state: 'unknown' }, 'writer_guard_invalid'],
    [{ ...openGuard, minProtocol: RXDB_WRITER_PROTOCOL_VERSION + 1 }, 'writer_protocol_unsupported'],
    [{ ...openGuard, state: 'draining' }, 'writer_guard_draining'],
    [{ ...openGuard, state: 'migrating' }, 'writer_guard_migrating'],
    [{ ...openGuard, state: 'failed' }, 'writer_guard_failed']
  ] as const)('fails closed for an unusable guard', (guard, code) => {
    expect(() => resolveRxDBWriterEpoch(guard, RXDB_WRITER_PROTOCOL_VERSION)).toThrow(
      expect.objectContaining({ code })
    );
  });

  it('fences a resumed writer whose epoch is stale', () => {
    expect(() => resolveRxDBWriterEpoch(openGuard, RXDB_WRITER_PROTOCOL_VERSION, 3)).toThrow(
      expect.objectContaining({ code: 'writer_fenced' })
    );
  });

  it('rejects an invalid writer protocol version', () => {
    expect(() => resolveRxDBWriterEpoch(openGuard, 0)).toThrow(
      expect.objectContaining({ code: 'writer_protocol_unsupported' })
    );
  });

  it('accepts a complete lease in the current guard epoch', () => {
    expect(
      readRxDBWriterLease(
        { writerId: 'writer', protocolVersion: RXDB_WRITER_PROTOCOL_VERSION, epoch: 4, validTtl: true, active: true },
        openGuard,
        RXDB_WRITER_PROTOCOL_VERSION
      )
    ).toEqual({
      writerId: 'writer',
      protocolVersion: RXDB_WRITER_PROTOCOL_VERSION,
      epoch: 4,
      validTtl: true,
      active: true
    });
  });

  it.each([
    [{ writerId: 'writer', protocolVersion: 0, epoch: 4, validTtl: true, active: true }, 'writer_protocol_unsupported'],
    [
      { writerId: 'writer', protocolVersion: RXDB_WRITER_PROTOCOL_VERSION, epoch: 3, validTtl: true, active: true },
      'writer_lease_invalid'
    ],
    [
      { writerId: 'writer', protocolVersion: RXDB_WRITER_PROTOCOL_VERSION, epoch: 4, validTtl: false, active: true },
      'writer_lease_invalid'
    ],
    [
      { writerId: '', protocolVersion: RXDB_WRITER_PROTOCOL_VERSION, epoch: 4, validTtl: true, active: true },
      'writer_lease_invalid'
    ]
  ] as const)('rejects an unsafe persisted lease', (lease, code) => {
    expect(() => readRxDBWriterLease(lease, openGuard, RXDB_WRITER_PROTOCOL_VERSION)).toThrow(
      expect.objectContaining({ code })
    );
  });

  it.each([
    [{ ...openGuard, epoch: 0 }, 'writer_guard_invalid'],
    [{ ...openGuard, epoch: 1.5 }, 'writer_guard_invalid'],
    [{ ...openGuard, minProtocol: 0 }, 'writer_guard_invalid']
  ] as const)('rejects malformed persisted guard data', (guard, code) => {
    expect(() => resolveRxDBWriterEpoch(guard, RXDB_WRITER_PROTOCOL_VERSION)).toThrow(
      expect.objectContaining({ code })
    );
  });
});
