import {
  isGenerationUuid,
  validateVideoGenerationJobSummary,
  validateVideoJobRequest,
  type VideoGenerationJobSummary,
  type VideoJobRequest
} from '../contracts/index';

export interface LocalVideoSubmission {
  key: string;
  request: VideoJobRequest;
  createdAt: string;
  firstSentAt: string | null;
}
export interface VideoSubmissionBook {
  version: 1;
  pending: LocalVideoSubmission | null;
}
export class VideoSubmissionError extends Error {
  constructor(message = '视频提交日志无效；停止提交，不用空日志覆盖或重复生成。') {
    super(message);
  }
}
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const object = (value: unknown, keys: string[]) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))
  )
    throw new VideoSubmissionError();
  return value as Record<string, unknown>;
};
export function validateVideoSubmissionBook(value: unknown): VideoSubmissionBook {
  const book = object(value, ['version', 'pending']);
  if (book['version'] !== 1) throw new VideoSubmissionError();
  if (book['pending'] === null) return { version: 1, pending: null };
  const pending = object(book['pending'], ['key', 'request', 'createdAt', 'firstSentAt']);
  if (
    !isGenerationUuid(pending['key']) ||
    !timestamp(pending['createdAt']) ||
    (pending['firstSentAt'] !== null &&
      (!timestamp(pending['firstSentAt']) || Date.parse(pending['firstSentAt']) < Date.parse(pending['createdAt'])))
  )
    throw new VideoSubmissionError();
  return {
    version: 1,
    pending: {
      key: pending['key'],
      request: validateVideoJobRequest(pending['request']),
      createdAt: pending['createdAt'],
      firstSentAt: pending['firstSentAt'] as string | null
    }
  };
}
export function createVideoSubmission(
  book: VideoSubmissionBook,
  request: VideoJobRequest,
  now = new Date()
): LocalVideoSubmission {
  if (book.pending) throw new VideoSubmissionError('已有未确认的视频意图；只能核对原提交，不能覆盖或新建。');
  const pending = {
    key: crypto.randomUUID(),
    request: validateVideoJobRequest(request),
    createdAt: now.toISOString(),
    firstSentAt: null
  };
  book.pending = pending;
  return pending;
}
export function markVideoSubmissionSent(
  book: VideoSubmissionBook,
  key: string,
  now = new Date()
): LocalVideoSubmission {
  const pending = book.pending;
  if (!pending || pending.key !== key) throw new VideoSubmissionError('视频意图已变化；请重新读取日志，不发送新请求。');
  const sent = pending.firstSentAt === null ? null : Date.parse(pending.firstSentAt);
  // Conservative client fence: an accepted terminal job's server key may expire
  // after 24h. A stale local retry must never silently become a second paid job.
  if (sent !== null && (now.getTime() < sent || now.getTime() >= sent + 24 * 60 * 60 * 1000))
    throw new VideoSubmissionError('原提交已超出安全核对期限或本机时钟回退；请核对持久任务及账单，不再次提交。');
  if (now.getTime() < Date.parse(pending.createdAt)) throw new VideoSubmissionError('本机时钟回退；未发送视频请求。');
  pending.firstSentAt ??= now.toISOString();
  return pending;
}
export function confirmVideoSubmission(book: VideoSubmissionBook, key: string, value: VideoGenerationJobSummary) {
  const pending = book.pending,
    job = validateVideoGenerationJobSummary(value);
  if (
    !pending ||
    pending.key !== key ||
    !pending.firstSentAt ||
    JSON.stringify(job.request) !== JSON.stringify(pending.request)
  )
    throw new VideoSubmissionError('视频回执与持久意图不一致；保留原日志，不允许新提交。');
  book.pending = null;
  return job;
}
