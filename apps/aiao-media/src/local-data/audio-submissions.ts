import {
  isGenerationUuid,
  validateAudioGenerationJobSummary,
  validateAudioJobRequest,
  type AudioGenerationJobSummary,
  type AudioJobRequest
} from '../contracts/index';

export interface LocalAudioSubmission {
  key: string;
  request: AudioJobRequest;
  createdAt: string;
  firstSentAt: string | null;
}
export interface AudioSubmissionBook {
  version: 1;
  pending: LocalAudioSubmission | null;
}
export class AudioSubmissionError extends Error {
  constructor(message = '配音提交日志无效；停止提交，不用空日志覆盖或重复生成。') {
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
    throw new AudioSubmissionError();
  return value as Record<string, unknown>;
};
export function validateAudioSubmissionBook(value: unknown): AudioSubmissionBook {
  const book = object(value, ['version', 'pending']);
  if (book['version'] !== 1) throw new AudioSubmissionError();
  if (book['pending'] === null) return { version: 1, pending: null };
  const pending = object(book['pending'], ['key', 'request', 'createdAt', 'firstSentAt']);
  if (
    !isGenerationUuid(pending['key']) ||
    !timestamp(pending['createdAt']) ||
    (pending['firstSentAt'] !== null &&
      (!timestamp(pending['firstSentAt']) || Date.parse(pending['firstSentAt']) < Date.parse(pending['createdAt'])))
  )
    throw new AudioSubmissionError();
  return {
    version: 1,
    pending: {
      key: pending['key'],
      request: validateAudioJobRequest(pending['request']),
      createdAt: pending['createdAt'],
      firstSentAt: pending['firstSentAt'] as string | null
    }
  };
}
export function createAudioSubmission(
  book: AudioSubmissionBook,
  request: AudioJobRequest,
  now = new Date()
): LocalAudioSubmission {
  if (book.pending) throw new AudioSubmissionError('已有未确认的配音意图；只能核对原提交，不能覆盖或新建。');
  const pending = {
    key: crypto.randomUUID(),
    request: validateAudioJobRequest(request),
    createdAt: now.toISOString(),
    firstSentAt: null
  };
  book.pending = pending;
  return pending;
}
export function markAudioSubmissionSent(
  book: AudioSubmissionBook,
  key: string,
  now = new Date()
): LocalAudioSubmission {
  const pending = book.pending;
  if (!pending || pending.key !== key) throw new AudioSubmissionError('配音意图已变化；请重新读取日志，不发送新请求。');
  const sent = pending.firstSentAt === null ? null : Date.parse(pending.firstSentAt);
  // Conservative client fence: an accepted terminal job's server key may expire
  // after 24h. A stale local retry must never silently become a second paid job.
  if (sent !== null && (now.getTime() < sent || now.getTime() >= sent + 24 * 60 * 60 * 1000))
    throw new AudioSubmissionError('原提交已超出安全核对期限或本机时钟回退；请核对持久任务及账单，不再次提交。');
  if (now.getTime() < Date.parse(pending.createdAt)) throw new AudioSubmissionError('本机时钟回退；未发送配音请求。');
  pending.firstSentAt ??= now.toISOString();
  return pending;
}
export function confirmAudioSubmission(book: AudioSubmissionBook, key: string, value: AudioGenerationJobSummary) {
  const pending = book.pending,
    job = validateAudioGenerationJobSummary(value);
  if (
    !pending ||
    pending.key !== key ||
    !pending.firstSentAt ||
    JSON.stringify(job.request) !== JSON.stringify(pending.request)
  )
    throw new AudioSubmissionError('配音回执与持久意图不一致；保留原日志，不允许新提交。');
  book.pending = null;
  return job;
}
