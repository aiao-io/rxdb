import { describe, expect, it } from 'vitest';
import { validateImageJobRequest } from '../contracts/index';
import {
  confirmImageSubmission,
  createImageSubmission,
  markImageSubmissionHandled,
  markImageSubmissionSent,
  rejectImageSubmission,
  validateImageSubmissionBook,
  type ImageSubmissionBook
} from './image-submissions';
import { readStudioPayload, studioPayload } from './studio-draft';
const selection = {
  kind: 'image' as const,
  operation: 'text-to-image' as const,
  providerInstanceId: '00000000-0000-4000-8000-000000000001',
  providerRevision: 1,
  modelId: 'fixture-image',
  prompt: 'test',
  aspectRatio: 'portrait' as const
};
describe('image MVP persistent editing and requests', () => {
  it('round trips image framing and template identity with the existing version-one draft', () => {
    const state = {
      document: {
        type: 'doc' as const,
        content: [
          {
            type: 'paragraph' as const,
            content: [{ type: 'text' as const, text: 'coffee' }]
          }
        ]
      },
      fields: [],
      values: {},
      aspectRatio: 'portrait' as const,
      templateId: 'coffee',
      templateVersion: 1
    };
    expect(readStudioPayload(studioPayload(state), 3).state).toEqual(state);
    expect(() => studioPayload({ ...state, aspectRatio: 'invalid' })).toThrow();
  });
  it('keeps framing in a frozen submission and distinguishes a definite rejection from a lost receipt', () => {
    const book: ImageSubmissionBook = { version: 1, submissions: [] };
    const id = crypto.randomUUID(),
      key = crypto.randomUUID();
    const item = createImageSubmission(book, selection, null, null, id, key, '2026-10-23T00:00:00Z');
    expect(item.selection.aspectRatio).toBe('portrait');
    const sent = markImageSubmissionSent(book, id, item.revision, '2026-10-23T00:00:01Z');
    expect(() => rejectImageSubmission(book, id, sent.revision, 503 as 429)).toThrow();
    const rejected = rejectImageSubmission(book, id, sent.revision, 429);
    expect(validateImageSubmissionBook(book).submissions[0].rejected).toBe(429);
    expect(() => markImageSubmissionSent(book, id, rejected.revision, '2026-10-23T00:00:02Z')).toThrow();
  });
  it('retains an additive handled-result marker without forgetting the frozen request', () => {
    const book: ImageSubmissionBook = { version: 1, submissions: [] };
    const item = createImageSubmission(
      book,
      selection,
      null,
      null,
      crypto.randomUUID(),
      crypto.randomUUID(),
      '2026-10-23T00:00:00Z'
    );
    expect(() =>
      validateImageSubmissionBook({
        version: 1,
        submissions: [{ ...item, resultHandled: true }]
      })
    ).toThrow();
    markImageSubmissionSent(book, item.id, item.revision, '2026-10-23T00:00:01Z');
    const jobId = crypto.randomUUID();
    confirmImageSubmission(book, item.id, item.revision, jobId, selection);
    markImageSubmissionHandled(book, jobId);
    expect(validateImageSubmissionBook(book).submissions[0]).toMatchObject({
      jobId,
      resultHandled: true,
      selection
    });
    const revision = item.revision;
    markImageSubmissionHandled(book, jobId);
    expect(item.revision).toBe(revision);
  });
  it('preserves legacy canonical request bytes when framing was not specified', () => {
    const { aspectRatio, ...legacy } = selection;
    void aspectRatio;
    expect(JSON.stringify(validateImageJobRequest(legacy))).toBe(JSON.stringify(legacy));
    expect(() => validateImageJobRequest({ ...selection, aspectRatio: 'arbitrary' })).toThrow();
  });
});
