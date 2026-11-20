import {
  isGenerationUuid,
  validateAsrGenerationJobSummary,
  validateAudioGenerationJobSummary,
  validateGenerationJobRequest,
  validateMusicGenerationJobSummary,
  validateVideoGenerationJobSummary,
  type AsrGenerationJobSummary,
  type AudioGenerationJobSummary,
  type AsrJobRequest,
  type AudioJobRequest,
  type GenerationJobRequest,
  type MusicGenerationJobSummary,
  type MusicJobRequest,
  type VideoGenerationJobSummary,
  type VideoJobRequest
} from '@aiao-media/api-contracts';

export type MediaSubmissionRequest = AudioJobRequest | AsrJobRequest | MusicJobRequest | VideoJobRequest;
export type MediaSubmissionJob =
  | AudioGenerationJobSummary
  | AsrGenerationJobSummary
  | MusicGenerationJobSummary
  | VideoGenerationJobSummary;
export interface LocalMediaSubmission {
  key: string;
  idempotencyKey: string;
  kind: 'audio' | 'video';
  operation: MediaSubmissionRequest['operation'];
  request: MediaSubmissionRequest;
  createdAt: string;
  firstSentAt: string | null;
  jobId: string | null;
  resultHandled: boolean;
  revision: number;
}
export interface MediaSubmissionBook {
  version: 1;
  submissions: LocalMediaSubmission[];
}
export class MediaSubmissionError extends Error {
  constructor(message = '媒体提交日志无效；停止提交，不用空日志覆盖或重复生成。') {
    super(message);
  }
}
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MediaSubmissionError();
  return value as Record<string, unknown>;
};
const keys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) => {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some(key => !Object.prototype.hasOwnProperty.call(value, key)) ||
    Object.keys(value).some(key => !allowed.has(key))
  )
    throw new MediaSubmissionError();
};
function requestOperation(value: GenerationJobRequest): MediaSubmissionRequest['operation'] {
  if (!['text-to-speech', 'speech-to-text', 'text-to-music', 'text-to-video'].includes(value.operation))
    throw new MediaSubmissionError();
  return value.operation as MediaSubmissionRequest['operation'];
}
function validateRequest(value: unknown): MediaSubmissionRequest {
  const request = validateGenerationJobRequest(value);
  if (request.kind === 'image') throw new MediaSubmissionError('图片提交使用图片日志。');
  requestOperation(request);
  return request;
}
function validateJob(value: unknown): MediaSubmissionJob {
  const job = object(value);
  const request = validateRequest(job['request']);
  if (request.operation === 'speech-to-text') return validateAsrGenerationJobSummary(value);
  if (request.operation === 'text-to-speech') return validateAudioGenerationJobSummary(value);
  if (request.operation === 'text-to-music') return validateMusicGenerationJobSummary(value);
  return validateVideoGenerationJobSummary(value);
}
function requestIdentity(value: MediaSubmissionRequest): string {
  return JSON.stringify(value);
}
function validateSubmission(value: unknown): LocalMediaSubmission {
  const input = object(value);
  keys(input, [
    'key',
    'idempotencyKey',
    'kind',
    'operation',
    'request',
    'createdAt',
    'firstSentAt',
    'jobId',
    'resultHandled',
    'revision'
  ]);
  const request = validateRequest(input['request']);
  if (
    !isGenerationUuid(input['key']) ||
    !isGenerationUuid(input['idempotencyKey']) ||
    input['kind'] !== request.kind ||
    input['operation'] !== request.operation ||
    !timestamp(input['createdAt']) ||
    (input['firstSentAt'] !== null &&
      (!timestamp(input['firstSentAt']) || Date.parse(input['firstSentAt']) < Date.parse(input['createdAt']))) ||
    (input['jobId'] !== null && !isGenerationUuid(input['jobId'])) ||
    typeof input['resultHandled'] !== 'boolean' ||
    typeof input['revision'] !== 'number' ||
    !Number.isSafeInteger(input['revision']) ||
    input['revision'] < 1
  )
    throw new MediaSubmissionError();
  return {
    key: input['key'],
    idempotencyKey: input['idempotencyKey'],
    kind: input['kind'],
    operation: input['operation'],
    request,
    createdAt: input['createdAt'],
    firstSentAt: input['firstSentAt'],
    jobId: input['jobId'],
    resultHandled: input['resultHandled'],
    revision: input['revision']
  } as LocalMediaSubmission;
}

export function validateMediaSubmissionBook(value: unknown): MediaSubmissionBook {
  const input = object(value);
  keys(input, ['version', 'submissions']);
  if (input['version'] !== 1 || !Array.isArray(input['submissions']) || input['submissions'].length > 32)
    throw new MediaSubmissionError();
  const submissions = input['submissions'].map(validateSubmission);
  const ids = new Set(submissions.map(item => item.key));
  const idempotencyKeys = new Set(submissions.map(item => item.idempotencyKey));
  if (ids.size !== submissions.length || idempotencyKeys.size !== submissions.length)
    throw new MediaSubmissionError();
  return { version: 1, submissions };
}

export function createMediaSubmission(
  book: MediaSubmissionBook,
  request: MediaSubmissionRequest,
  now = new Date()
): LocalMediaSubmission {
  const validated = validateRequest(request);
  if (
    book.submissions.some(
      submission => !submission.resultHandled && requestIdentity(submission.request) === requestIdentity(validated)
    )
  )
    throw new MediaSubmissionError('已有相同的未确认媒体意图；只能核对原提交，不能覆盖或新建。');
  const submission: LocalMediaSubmission = {
    key: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    kind: validated.kind,
    operation: validated.operation,
    request: validated,
    createdAt: now.toISOString(),
    firstSentAt: null,
    jobId: null,
    resultHandled: false,
    revision: 1
  };
  book.submissions = [submission, ...book.submissions];
  return submission;
}

export function markMediaSubmissionSent(
  book: MediaSubmissionBook,
  key: string,
  now = new Date()
): LocalMediaSubmission {
  const submission = book.submissions.find(item => item.key === key);
  if (!submission) throw new MediaSubmissionError('媒体意图已变化；请重新读取日志，不发送新请求。');
  const sent = submission.firstSentAt === null ? null : Date.parse(submission.firstSentAt);
  if (sent !== null && (now.getTime() < sent || now.getTime() >= sent + 24 * 60 * 60 * 1000))
    throw new MediaSubmissionError('原提交已超出安全核对期限或本机时钟回退；请核对任务及账单，不再次提交。');
  if (now.getTime() < Date.parse(submission.createdAt)) throw new MediaSubmissionError('本机时钟回退；未发送媒体请求。');
  if (submission.firstSentAt === null) {
    submission.firstSentAt = now.toISOString();
    submission.revision += 1;
  }
  return submission;
}

export function confirmMediaSubmission(
  book: MediaSubmissionBook,
  key: string,
  value: MediaSubmissionJob
): MediaSubmissionJob {
  const submission = book.submissions.find(item => item.key === key);
  if (!submission || !submission.firstSentAt) throw new MediaSubmissionError('媒体回执与持久意图不一致。');
  const job = validateJob(value);
  if (
    job.request.operation !== submission.operation ||
    job.request.kind !== submission.kind ||
    requestIdentity(job.request) !== requestIdentity(submission.request)
  )
    throw new MediaSubmissionError('媒体回执与持久意图不一致；保留原日志，不允许新提交。');
  submission.jobId = job.id;
  submission.resultHandled = false;
  submission.revision += 1;
  return job;
}

export function markMediaSubmissionHandled(book: MediaSubmissionBook, jobId: string): LocalMediaSubmission {
  const submission = book.submissions.find(item => item.jobId === jobId);
  if (!submission) throw new MediaSubmissionError('媒体结果没有对应的本机提交意图。');
  submission.resultHandled = true;
  submission.revision += 1;
  return submission;
}

export function migrateLegacyMediaSubmission(value: unknown): LocalMediaSubmission | null {
  if (!value) return null;
  const input = object(value);
  const request = validateRequest(input['request']);
  const key = input['key'];
  const createdAt = input['createdAt'];
  const firstSentAt = input['firstSentAt'];
  if (
    !isGenerationUuid(key) ||
    !timestamp(createdAt) ||
    (firstSentAt !== null && !timestamp(firstSentAt))
  )
    throw new MediaSubmissionError();
  return {
    key,
    idempotencyKey: key,
    kind: request.kind,
    operation: request.operation,
    request,
    createdAt,
    firstSentAt,
    jobId: null,
    resultHandled: false,
    revision: 1
  };
}
