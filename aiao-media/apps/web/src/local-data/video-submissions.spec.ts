import { describe, expect, it } from 'vitest';
import type { VideoGenerationJobSummary, VideoJobRequest } from '../contracts/index';
import {
  confirmVideoSubmission,
  createVideoSubmission,
  markVideoSubmissionSent,
  validateVideoSubmissionBook,
  type VideoSubmissionBook
} from './video-submissions';
const request: VideoJobRequest = {
  kind: 'video',
  operation: 'text-to-video',
  providerInstanceId: '10000000-0000-4000-8000-000000000001',
  providerRevision: 1,
  modelId: 'MiniMax-H3-Max',
  profileId: 'test-profile',
  prompt: '本机视频意图'
};
const now = new Date('2026-10-02T00:00:00Z');
const fresh = (): VideoSubmissionBook => ({ version: 1, pending: null });
const receipt = (value = request): VideoGenerationJobSummary => ({
  id: '10000000-0000-4000-8000-000000000002',
  request: value,
  status: 'queued',
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  delivery: { status: 'pending', expiresAt: null, acknowledgedAt: null },
  failure: null,
  result: null
});
describe('local durable video intent (not encryption or provider proof)', () => {
  it('reopens the exact canonical request and caller-owned key and never overwrites an unresolved intent', () => {
    const book = fresh(),
      created = createVideoSubmission(book, { ...request, prompt: `  ${request.prompt}  ` }, now);
    const saved = validateVideoSubmissionBook(JSON.parse(JSON.stringify(book)));
    expect(saved.pending).toEqual(created);
    expect(saved.pending?.request.prompt).toBe(request.prompt);
    expect(() => createVideoSubmission(saved, request, now)).toThrow('已有未确认');
    expect(saved.pending?.key).toBe(created.key);
  });
  it('records first send before transport, preserves it on retries and fences terminal-key expiry', () => {
    const book = fresh(),
      created = createVideoSubmission(book, request, now);
    expect(markVideoSubmissionSent(book, created.key, now).firstSentAt).toBe(now.toISOString());
    const again = new Date(now.getTime() + 1000);
    expect(markVideoSubmissionSent(book, created.key, again).firstSentAt).toBe(now.toISOString());
    expect(() => markVideoSubmissionSent(book, created.key, new Date(now.getTime() + 86400000))).toThrow(
      '安全核对期限'
    );
    expect(() => markVideoSubmissionSent(book, created.key, new Date(now.getTime() - 1))).toThrow('时钟回退');
    expect(book.pending?.key).toBe(created.key);
  });
  it('only clears after an exact validated receipt, not wrong request/key or merely a list match', () => {
    const book = fresh(),
      created = createVideoSubmission(book, request, now);
    markVideoSubmissionSent(book, created.key, now);
    expect(() => confirmVideoSubmission(book, created.key, receipt({ ...request, prompt: 'another' }))).toThrow(
      '不一致'
    );
    expect(() => confirmVideoSubmission(book, crypto.randomUUID(), receipt())).toThrow('不一致');
    expect(book.pending).not.toBeNull();
    expect(confirmVideoSubmission(book, created.key, receipt())).toEqual(receipt());
    expect(book.pending).toBeNull();
  });
  it('stale tabs cannot mark or clear another tab’s intent', () => {
    const book = fresh(),
      old = createVideoSubmission(book, request, now);
    markVideoSubmissionSent(book, old.key, now);
    confirmVideoSubmission(book, old.key, receipt());
    const current = createVideoSubmission(book, request, now);
    expect(() => markVideoSubmissionSent(book, old.key, now)).toThrow('已变化');
    expect(() => confirmVideoSubmission(book, old.key, receipt())).toThrow('不一致');
    expect(book.pending?.key).toBe(current.key);
  });
  it.each([
    { version: 2, pending: null },
    { version: 1 },
    { version: 1, pending: null, extra: true },
    { version: 1, pending: { key: 'bad' } }
  ])('rejects corrupted logs instead of resetting them', value => {
    expect(() => validateVideoSubmissionBook(value)).toThrow();
  });
});
