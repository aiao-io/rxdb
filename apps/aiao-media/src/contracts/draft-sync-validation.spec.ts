import { describe, expect, it } from 'vitest';
import {
  validateDraftConflicts,
  validateDraftContent,
  validateDraftPull,
  validateDraftPush,
  validateDraftResolution
} from './draft-sync-validation';
const id = '10000000-0000-4000-8000-000000000001';
const content = {
  kind: 'image',
  prompt: 'metadata',
  requiresReference: false,
  parameters: { operation: 'text-to-image' }
};
const draft = {
  id,
  revision: 1,
  sequence: 1,
  content,
  deleted: false,
  updatedAt: '2026-10-01T00:00:00.000Z'
};
describe('strict metadata-only draft response validation', () => {
  it.each(['fileId', 'referenceId', 'url', 'path', 'credentials', 'userId'])(
    'rejects unexpected %s fields instead of persisting them',
    key => {
      expect(() => validateDraftContent({ ...content, [key]: 'sensitive' })).toThrow();
    }
  );
  it('rejects incompatible version and malformed but parseable replies', () => {
    expect(() =>
      validateDraftPush({
        version: 2,
        status: 'applied',
        draft,
        reused: false
      })
    ).toThrow();
    expect(() =>
      validateDraftPull({
        version: 1,
        drafts: null,
        reset: false,
        hasMore: false,
        checkpoint: 'checkpoint'
      })
    ).toThrow();
    expect(() => validateDraftConflicts({ version: 1, conflicts: [null] })).toThrow();
  });
  it('rejects tombstone payloads, invalid revisions and unknown result fields', () => {
    expect(() =>
      validateDraftPush({
        version: 1,
        status: 'applied',
        draft: { ...draft, deleted: true },
        reused: false
      })
    ).toThrow();
    expect(() =>
      validateDraftPush({
        version: 1,
        status: 'applied',
        draft: { ...draft, revision: 0 },
        reused: false
      })
    ).toThrow();
    expect(() =>
      validateDraftPush({
        version: 1,
        status: 'applied',
        draft,
        reused: false,
        token: 'secret'
      })
    ).toThrow();
  });
  it('accepts supported metadata and explicit tombstones', () => {
    expect(validateDraftPush({ version: 1, status: 'applied', draft, reused: true }).status).toBe('applied');
    expect(
      validateDraftResolution({
        version: 1,
        conflictId: id,
        choice: 'remote',
        draft: { ...draft, deleted: true, content: null },
        resolvedAt: draft.updatedAt,
        reused: false
      }).draft?.deleted
    ).toBe(true);
  });
  it('rejects inconsistent reference hints, model/path strings and unsupported resolution choices', () => {
    expect(() => validateDraftContent({ ...content, requiresReference: true })).toThrow();
    expect(() =>
      validateDraftContent({
        ...content,
        parameters: { modelId: '../../file' }
      })
    ).toThrow();
    expect(() =>
      validateDraftResolution({
        version: 1,
        conflictId: id,
        choice: 'merge',
        draft: null,
        resolvedAt: draft.updatedAt,
        reused: false
      })
    ).toThrow();
  });
});
