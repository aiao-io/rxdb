import { describe, expect, it } from 'vitest';
import type { ImageSubmissionBook, ImageSubmissionSelection } from './image-submissions';
import {
  attachImageUpload,
  confirmImageSubmission,
  createImageSubmission,
  discardUnsentImageSubmission,
  imageSubmissionRequest,
  markImageSubmissionSent,
  validateImageSubmissionBook
} from './image-submissions';
const ids = [1, 2, 3, 4, 5, 6].map(n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const now = '2026-10-01T12:00:00.000Z',
  later = '2026-10-01T12:01:00.000Z';
const selection: ImageSubmissionSelection = {
  kind: 'image',
  operation: 'reference-image',
  providerInstanceId: ids[0],
  providerRevision: 1,
  modelId: 'offline-fixture',
  prompt: '本机描述'
};
const upload = {
  id: ids[3],
  mediaType: 'image/png' as const,
  bytes: 128,
  width: 1,
  height: 1,
  expiresAt: '2026-10-01T12:30:00.000Z'
};
const book = (): ImageSubmissionBook => ({ version: 1, submissions: [] });
const create = (b: ImageSubmissionBook) =>
  createImageSubmission(b, selection, ids[2], { id: ids[5], localRevision: 1 }, ids[1], ids[4], now);
describe('device-only image submission journal', () => {
  it('freezes provenance, original reference ID and a unique persisted idempotency key', () => {
    const b = book(),
      item = create(b);
    expect(item.idempotencyKey).toBe(ids[4]);
    expect(item.draftSource?.id).toBe(ids[5]);
    expect(validateImageSubmissionBook(JSON.parse(JSON.stringify(b)))).toEqual(b);
    expect(() => imageSubmissionRequest(item)).toThrow();
  });
  it('refuses to mark dispatch before an upload receipt is persisted', () => {
    const b = book(),
      item = create(b);
    expect(() => markImageSubmissionSent(b, item.id, item.revision, later)).toThrow();
    expect(item.firstSentAt).toBeNull();
  });
  it('builds a server request without device IDs, provenance or file paths', () => {
    const b = book(),
      item = create(b);
    attachImageUpload(b, item.id, 1, upload);
    const request = imageSubmissionRequest(item);
    expect(request).toMatchObject({
      operation: 'reference-image',
      referenceImageId: ids[3]
    });
    expect(Object.keys(request)).not.toContain('localReferenceId');
    expect(Object.keys(request)).not.toContain('draftSource');
  });
  it('preserves exactly the same request and key after dispatch and across JSON reopen', () => {
    const b = book(),
      item = create(b);
    attachImageUpload(b, item.id, 1, upload);
    markImageSubmissionSent(b, item.id, 2, later);
    const reopened = validateImageSubmissionBook(JSON.parse(JSON.stringify(b))),
      retry = markImageSubmissionSent(reopened, item.id, 3, '2026-10-01T12:02:00.000Z');
    expect(imageSubmissionRequest(retry)).toEqual(imageSubmissionRequest(item));
    expect(retry.idempotencyKey).toBe(item.idempotencyKey);
    expect(retry.firstSentAt).toBe(later);
  });
  it('does not allow replacing an upload after the exact request was frozen', () => {
    const b = book(),
      item = create(b);
    attachImageUpload(b, item.id, 1, upload);
    markImageSubmissionSent(b, item.id, 2, later);
    expect(() => attachImageUpload(b, item.id, 3, { ...upload, id: ids[0] })).toThrow();
    expect(item.upload?.id).toBe(upload.id);
  });
  it('guards stale cross-window revisions before changing state', () => {
    const b = book(),
      item = create(b);
    attachImageUpload(b, item.id, 1, upload);
    expect(() => markImageSubmissionSent(b, item.id, 1, later)).toThrow();
    expect(item.firstSentAt).toBeNull();
  });
  it('rejects initial dispatch with an expired upload without losing the original reference', () => {
    const b = book(),
      item = create(b);
    attachImageUpload(b, item.id, 1, upload);
    expect(() => markImageSubmissionSent(b, item.id, 2, upload.expiresAt)).toThrow();
    expect(item.localReferenceId).toBe(ids[2]);
    expect(item.firstSentAt).toBeNull();
  });
  it('can replay a previously sent request even when its upload has since expired', () => {
    const b = book(),
      item = create(b);
    attachImageUpload(b, item.id, 1, upload);
    markImageSubmissionSent(b, item.id, 2, later);
    expect(markImageSubmissionSent(b, item.id, 3, '2026-10-01T13:00:00.000Z').idempotencyKey).toBe(ids[4]);
  });
  it('never resends outside the conservative receipt window or after clock rollback', () => {
    const b = book(),
      item = create(b);
    attachImageUpload(b, item.id, 1, upload);
    markImageSubmissionSent(b, item.id, 2, later);
    for (const time of ['2026-10-02T11:01:00.000Z', now])
      expect(() => markImageSubmissionSent(b, item.id, 3, time)).toThrow();
  });
  it('accepts only a receipt with the exact instance revision, prompt, model and upload ID', () => {
    const b = book(),
      item = create(b);
    attachImageUpload(b, item.id, 1, upload);
    markImageSubmissionSent(b, item.id, 2, later);
    expect(() =>
      confirmImageSubmission(b, item.id, 3, ids[0], {
        ...imageSubmissionRequest(item),
        prompt: 'other'
      })
    ).toThrow();
    expect(item.jobId).toBeNull();
    confirmImageSubmission(b, item.id, 3, ids[0], imageSubmissionRequest(item));
    expect(item.jobId).toBe(ids[0]);
    expect(() => markImageSubmissionSent(b, item.id, 4, later)).toThrow();
  });
  it('supports text requests without fabricating a reference upload', () => {
    const b = book(),
      item = createImageSubmission(b, { ...selection, operation: 'text-to-image' }, null, null, ids[1], ids[4], now);
    markImageSubmissionSent(b, item.id, 1, later);
    expect(imageSubmissionRequest(item).operation).toBe('text-to-image');
    expect(() => attachImageUpload(b, item.id, 2, upload)).toThrow();
  });
  it('fails closed on corrupt journals, duplicate keys and inline secrets', () => {
    const b = book(),
      item = create(b);
    for (const value of [
      { ...b, credential: 'secret' },
      { ...b, submissions: [item, item] },
      {
        ...b,
        submissions: [{ ...item, selection: { ...selection, filePath: '/private.png' } }]
      },
      { ...b, submissions: [{ ...item, jobId: ids[0] }] }
    ])
      expect(() => validateImageSubmissionBook(value)).toThrow();
  });
});

describe('discard only an unsent intent', () => {
  it('removes an unsent uploaded intent without changing unrelated entries', () => {
    const b = book(),
      item = create(b);
    attachImageUpload(b, item.id, 1, upload);
    discardUnsentImageSubmission(b, item.id, 2);
    expect(b.submissions).toEqual([]);
    expect(validateImageSubmissionBook(b)).toEqual(b);
  });
  it('rejects a stale revision and preserves the pinned original', () => {
    const b = book(),
      item = create(b);
    attachImageUpload(b, item.id, 1, upload);
    expect(() => discardUnsentImageSubmission(b, item.id, 1)).toThrow();
    expect(b.submissions[0].localReferenceId).toBe(ids[2]);
  });
  it('cannot forget a dispatch with a lost or confirmed receipt', () => {
    const b = book(),
      item = create(b);
    attachImageUpload(b, item.id, 1, upload);
    markImageSubmissionSent(b, item.id, 2, later);
    expect(() => discardUnsentImageSubmission(b, item.id, 3)).toThrow();
    confirmImageSubmission(b, item.id, 3, ids[0], imageSubmissionRequest(item));
    expect(() => discardUnsentImageSubmission(b, item.id, 4)).toThrow();
    expect(b.submissions).toHaveLength(1);
  });
  it('rejects a corrupt journal instead of treating pinned originals as orphans', () => {
    const b = book(),
      item = create(b);
    const changed = structuredClone(b);
    changed.submissions[0].localReferenceId = 'unsafe/path';
    expect(() => validateImageSubmissionBook(changed)).toThrow();
    expect(b.submissions[0].localReferenceId).toBe(item.localReferenceId);
    expect(() => validateImageSubmissionBook({ version: 1, submissions: [], extra: true })).toThrow();
  });
});
