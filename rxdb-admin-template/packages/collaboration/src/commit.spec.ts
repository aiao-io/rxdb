import { describe, expect, it } from 'vitest';
import { assertFingerprints, commitFingerprint, sealCommit, uuidv7 } from './commit.js';
import { diffRecords } from './changes.js';
import { CollaborationError, type Commit } from './model.js';

const changes = diffRecords({}, { c: { entity: 'AssetCategory', fields: { name: 'Computers' } } });
const draft = { id: 'commit-1', parent: null, authorId: 'alice', message: 'First', changes };

describe('commit fingerprint', () => {
  it('is a SHA-256 hex digest of the canonical parent, author, message and changes', async () => {
    const fingerprint = await commitFingerprint(draft);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    const canonical = JSON.stringify({
      authorId: 'alice',
      changes: [
        {
          entity: 'AssetCategory',
          entityId: 'c',
          inversePatch: null,
          namespace: 'assets',
          operation: 'insert',
          patch: { name: 'Computers' }
        }
      ],
      message: 'First',
      parent: null
    });
    const expected = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    expect(fingerprint).toBe([...new Uint8Array(expected)].map(byte => byte.toString(16).padStart(2, '0')).join(''));
  });
  it('does not depend on key order, the commit id or merge links', async () => {
    const fingerprint = await commitFingerprint(draft);
    const reordered = {
      message: 'First',
      changes: changes.map(({ patch, inversePatch, ...rest }) => ({ inversePatch, patch, ...rest })),
      authorId: 'alice',
      parent: null
    };
    expect(await commitFingerprint(reordered)).toBe(fingerprint);
    const merged = { ...draft, id: 'other', mergeSource: 'source', candidateId: 'candidate' };
    expect(await commitFingerprint(merged)).toBe(fingerprint);
  });
  it('changes with each of the parent, the author, the message and the changes', async () => {
    const fingerprint = await commitFingerprint(draft);
    const variants = [
      { ...draft, parent: 'x' },
      { ...draft, authorId: 'bob' },
      { ...draft, message: 'Second' },
      { ...draft, changes: [] },
      { ...draft, changes: [{ ...changes[0], patch: { name: 'Laptops' } }] },
      { ...draft, changes: [...changes, ...changes] }
    ];
    const all = await Promise.all(variants.map(variant => commitFingerprint(variant)));
    for (const other of all) expect(other).not.toBe(fingerprint);
    expect(new Set(all).size).toBe(all.length);
  });
  it('seals a commit with its fingerprint', async () => {
    const sealed = await sealCommit(draft);
    expect(sealed).toEqual({ ...draft, fingerprint: await commitFingerprint(draft) });
  });
});

describe('fingerprint verification', () => {
  it('accepts commits whose declared fingerprint matches their content', async () => {
    const sealed = await sealCommit(draft);
    await expect(assertFingerprints([sealed, await sealCommit({ ...draft, id: 'commit-2' })])).resolves.toBeUndefined();
  });
  it('rejects a mismatching fingerprint as invalid, whichever part of the content was altered', async () => {
    const sealed = await sealCommit(draft);
    const forged: Commit[] = [
      { ...sealed, message: 'Tampered' },
      { ...sealed, authorId: 'mallory' },
      { ...sealed, parent: 'elsewhere' },
      { ...sealed, changes: [] },
      { ...sealed, fingerprint: '0'.repeat(64) }
    ];
    for (const commit of forged) {
      const failure = await assertFingerprints([sealed, commit]).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(CollaborationError);
      expect(failure).toMatchObject({ code: 'invalid', message: '提交指纹与内容不一致' });
    }
  });
});

describe('commit ids', () => {
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  it('are UUIDv7: version 7, RFC variant, and the first 48 bits are the millisecond timestamp', () => {
    const at = Date.UTC(2026, 10, 17, 8, 30, 15, 123);
    const id = uuidv7(at);
    expect(id).toMatch(pattern);
    expect(Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16)).toBe(at);
  });
  it('are unique and sort by creation time', () => {
    const ids = Array.from({ length: 200 }, (_, index) => uuidv7(1_800_000_000_000 + index));
    expect(new Set(ids).size).toBe(200);
    expect([...ids].sort()).toEqual(ids);
    expect(uuidv7()).toMatch(pattern);
  });
});
