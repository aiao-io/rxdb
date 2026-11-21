import { describe, expect, it } from 'vitest';
import {
  createMediaSubmission,
  markMediaSubmissionHandled,
  markMediaSubmissionSent,
  validateMediaSubmissionBook
} from './media-submissions';

const request = {
  kind: 'audio' as const,
  operation: 'text-to-speech' as const,
  providerInstanceId: '10000000-0000-4000-8000-000000000001',
  providerRevision: 1,
  modelId: 'fixture-tts',
  language: 'zh-CN',
  voiceId: 'alloy',
  speed: 1,
  text: '你好'
};

describe('媒体统一提交日志', () => {
  it('允许多个不同意图，并阻止相同请求重复提交', () => {
    const book = { version: 1 as const, submissions: [] };
    const first = createMediaSubmission(book, request, new Date('2026-11-20T00:00:00.000Z'));
    createMediaSubmission(book, { ...request, text: '另一个任务' }, new Date('2026-11-20T00:00:01.000Z'));
    expect(book.submissions).toHaveLength(2);
    expect(() => createMediaSubmission(book, request)).toThrow('相同');
    const restored = validateMediaSubmissionBook(JSON.parse(JSON.stringify(book)));
    expect(restored.submissions.find(item => item.key === first.key)).toEqual(first);
  });

  it('发送和本机处理只更新日志，不覆盖请求快照', () => {
    const book = { version: 1 as const, submissions: [] };
    const submission = createMediaSubmission(book, request);
    markMediaSubmissionSent(book, submission.key);
    submission.jobId = '10000000-0000-4000-8000-000000000010';
    markMediaSubmissionHandled(book, submission.jobId);
    const restored = validateMediaSubmissionBook(JSON.parse(JSON.stringify(book)));
    expect(restored.submissions[0].request).toEqual(request);
    expect(restored.submissions[0].resultHandled).toBe(true);
  });
});
