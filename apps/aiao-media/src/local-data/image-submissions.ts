import type { ImageJobRequest, ReferenceImageUpload } from '../contracts/index';
import { validateImageJobRequest, validateReferenceImageUpload } from '../contracts/index';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const placeholder = '00000000-0000-4000-8000-000000000001';
const timestamp = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 40 && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v) && Number.isFinite(Date.parse(v));
export interface ImageSubmissionSelection {
  aspectRatio?: ImageJobRequest['aspectRatio'];
  kind: 'image';
  operation: 'text-to-image' | 'reference-image';
  providerInstanceId: string;
  providerRevision: number;
  modelId: string;
  prompt: string;
}
export interface ImageDraftSource {
  id: string;
  localRevision: number;
}
/** Device-only journal. Never included in draft sync or sent as generation parameters. */
export interface LocalImageSubmission {
  id: string;
  revision: number;
  idempotencyKey: string;
  createdAt: string;
  selection: ImageSubmissionSelection;
  localReferenceId: string | null;
  draftSource: ImageDraftSource | null;
  upload: ReferenceImageUpload | null;
  firstSentAt: string | null;
  jobId: string | null;
  rejected?: 400 | 401 | 403 | 429;
  /** Result was saved or explicitly removed here; do not auto-import it again. */
  resultHandled?: true;
}
export interface ImageSubmissionBook {
  version: 1;
  submissions: LocalImageSubmission[];
}
export class ImageSubmissionError extends Error {
  constructor(message = '本机提交日志无效；没有覆盖或重复生成。') {
    super(message);
    this.name = 'ImageSubmissionError';
  }
}
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ImageSubmissionError();
  return v as Record<string, unknown>;
};
const keys = (v: Record<string, unknown>, names: string[]) => {
  if (Object.keys(v).length !== names.length || names.some(name => !Object.prototype.hasOwnProperty.call(v, name)))
    throw new ImageSubmissionError();
};
export function validateImageSubmissionSelection(value: unknown): ImageSubmissionSelection {
  const v = object(value);
  keys(v, [
    'kind',
    'operation',
    'providerInstanceId',
    'providerRevision',
    'modelId',
    'prompt',
    ...(v['aspectRatio'] !== undefined ? ['aspectRatio'] : [])
  ]);
  const request = validateImageJobRequest({
    ...v,
    ...(v['operation'] === 'reference-image' ? { referenceImageId: placeholder } : {})
  });
  const { kind, operation, providerInstanceId, providerRevision, modelId, prompt } = request;
  return {
    kind,
    operation,
    providerInstanceId,
    providerRevision,
    modelId,
    prompt,
    ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {})
  };
}
export function validateImageSubmissionBook(value: unknown): ImageSubmissionBook {
  const v = object(value);
  keys(v, ['version', 'submissions']);
  if (v['version'] !== 1 || !Array.isArray(v['submissions']) || v['submissions'].length > 500)
    throw new ImageSubmissionError();
  const seen = new Set<string>(),
    seenKeys = new Set<string>(),
    jobs = new Set<string>();
  for (const value of v['submissions']) {
    const item = object(value);
    keys(item, [
      'id',
      'revision',
      'idempotencyKey',
      'createdAt',
      'selection',
      'localReferenceId',
      'draftSource',
      'upload',
      'firstSentAt',
      'jobId',
      ...(item['rejected'] !== undefined ? ['rejected'] : []),
      ...(item['resultHandled'] !== undefined ? ['resultHandled'] : [])
    ]);
    if (item['resultHandled'] !== undefined && (item['resultHandled'] !== true || item['jobId'] === null))
      throw new ImageSubmissionError();
    if (
      item['rejected'] !== undefined &&
      (![400, 401, 403, 429].includes(Number(item['rejected'])) ||
        item['jobId'] !== null ||
        item['firstSentAt'] === null)
    )
      throw new ImageSubmissionError();
    if (
      typeof item['id'] !== 'string' ||
      !uuid.test(item['id']) ||
      !Number.isSafeInteger(item['revision']) ||
      Number(item['revision']) < 1 ||
      Number(item['revision']) > 2_147_483_647 ||
      typeof item['idempotencyKey'] !== 'string' ||
      !uuid.test(item['idempotencyKey']) ||
      !timestamp(item['createdAt']) ||
      seen.has(item['id']) ||
      seenKeys.has(item['idempotencyKey'])
    )
      throw new ImageSubmissionError();
    seen.add(item['id']);
    seenKeys.add(item['idempotencyKey']);
    const selection = validateImageSubmissionSelection(item['selection']);
    if (
      selection.operation === 'reference-image' ?
        typeof item['localReferenceId'] !== 'string' || !uuid.test(item['localReferenceId'])
      : item['localReferenceId'] !== null || item['upload'] !== null
    )
      throw new ImageSubmissionError();
    if (item['draftSource'] !== null) {
      const draft = object(item['draftSource']);
      keys(draft, ['id', 'localRevision']);
      if (
        typeof draft['id'] !== 'string' ||
        !uuid.test(draft['id']) ||
        !Number.isSafeInteger(draft['localRevision']) ||
        Number(draft['localRevision']) < 1
      )
        throw new ImageSubmissionError();
    }
    if (item['upload'] !== null) validateReferenceImageUpload(item['upload']);
    if (
      item['firstSentAt'] !== null &&
      (!timestamp(item['firstSentAt']) ||
        Date.parse(item['firstSentAt']) < Date.parse(item['createdAt']) ||
        (selection.operation === 'reference-image' && item['upload'] === null))
    )
      throw new ImageSubmissionError();
    if (item['jobId'] !== null) {
      if (
        typeof item['jobId'] !== 'string' ||
        !uuid.test(item['jobId']) ||
        item['firstSentAt'] === null ||
        jobs.has(item['jobId'])
      )
        throw new ImageSubmissionError();
      jobs.add(item['jobId']);
    }
  }
  return structuredClone(v) as unknown as ImageSubmissionBook;
}
export function createImageSubmission(
  book: ImageSubmissionBook,
  value: ImageSubmissionSelection,
  localReferenceId: string | null,
  draftSource: ImageDraftSource | null,
  id: string,
  key: string,
  now: string
) {
  if (book.submissions.length >= 500)
    throw new ImageSubmissionError('本机提交日志已达 500 条；没有发送任务，现有回执与原图保留，停止新提交。');
  const item: LocalImageSubmission = {
    id,
    revision: 1,
    idempotencyKey: key,
    createdAt: now,
    selection: validateImageSubmissionSelection(value),
    localReferenceId,
    draftSource,
    upload: null,
    firstSentAt: null,
    jobId: null
  };
  const next = validateImageSubmissionBook({
    version: 1,
    submissions: [...book.submissions, item]
  });
  book.submissions = next.submissions;
  return book.submissions[book.submissions.length - 1];
}
function current(book: ImageSubmissionBook, id: string, revision: number) {
  const item = book.submissions.find(item => item.id === id);
  if (!item || item.revision !== revision || revision >= 2_147_483_647)
    throw new ImageSubmissionError('提交日志已被另一窗口更新；请重新载入，不重复创建任务。');
  return item;
}
export function attachImageUpload(
  book: ImageSubmissionBook,
  id: string,
  revision: number,
  upload: ReferenceImageUpload
) {
  const item = current(book, id, revision);
  if (item.firstSentAt || item.jobId || item.selection.operation !== 'reference-image' || item.upload)
    throw new ImageSubmissionError('已冻结的任务不可更换上传；没有新建幂等键。');
  item.upload = validateReferenceImageUpload(upload);
  item.revision++;
  return item;
}
/** Freeze the exact request before fetch; a lost receipt must never generate a new key. */
export function markImageSubmissionSent(book: ImageSubmissionBook, id: string, revision: number, now: string) {
  const item = current(book, id, revision);
  if (item.jobId || item.rejected) throw new ImageSubmissionError('此提交已有任务回执，不重复提交。');
  if (!timestamp(now) || Date.parse(now) < Date.parse(item.createdAt))
    throw new ImageSubmissionError('本机时间回退，停止提交。');
  if (item.firstSentAt) {
    // Server receipt retention is 24h. Stop earlier rather than risk a new paid job
    // after receipt expiry. Pending server jobs may live longer but need manual review.
    if (
      Date.parse(now) < Date.parse(item.firstSentAt) ||
      Date.parse(now) - Date.parse(item.firstSentAt) >= 23 * 60 * 60 * 1000
    )
      throw new ImageSubmissionError('回执核对窗口已过或本机时间回退；只允许查询任务历史，不再次生成。');
  } else {
    if (
      item.selection.operation === 'reference-image' &&
      (!item.upload || Date.parse(item.upload.expiresAt) <= Date.parse(now))
    )
      throw new ImageSubmissionError('参考图上传已过期或未确认；没有提交任务。');
    item.firstSentAt = now;
  }
  item.revision++;
  return item;
}
export function imageSubmissionRequest(item: LocalImageSubmission): ImageJobRequest {
  return validateImageJobRequest({
    ...item.selection,
    ...(item.selection.operation === 'reference-image' ? { referenceImageId: item.upload?.id } : {})
  });
}
export function confirmImageSubmission(
  book: ImageSubmissionBook,
  id: string,
  revision: number,
  jobId: string,
  request: ImageJobRequest
) {
  const item = current(book, id, revision);
  if (
    !item.firstSentAt ||
    !uuid.test(jobId) ||
    (item.jobId && item.jobId !== jobId) ||
    JSON.stringify(validateImageJobRequest(request)) !== JSON.stringify(imageSubmissionRequest(item)) ||
    book.submissions.some(other => other.id !== item.id && other.jobId === jobId)
  )
    throw new ImageSubmissionError('任务回执与冻结请求不匹配；不确认成功，不重复生成。');
  item.jobId = jobId;
  item.revision++;
  return item;
}
/** Safe only before durable dispatch intent; unknown/accepted requests are never forgotten. */
export function discardUnsentImageSubmission(book: ImageSubmissionBook, id: string, revision: number) {
  const item = current(book, id, revision);
  if (item.firstSentAt || item.jobId)
    throw new ImageSubmissionError('已派发或回执不明的提交不可丢弃；请核对任务历史。');
  book.submissions = book.submissions.filter(value => value.id !== id);
}

/** Only an explicit HTTP pre-admission refusal; network/5xx/timeout outcomes stay unknown. */
export function rejectImageSubmission(
  book: ImageSubmissionBook,
  id: string,
  revision: number,
  status: 400 | 401 | 403 | 429
) {
  const item = current(book, id, revision);
  if (!item.firstSentAt || item.jobId || item.rejected || ![400, 401, 403, 429].includes(status))
    throw new ImageSubmissionError();
  item.rejected = status;
  item.revision++;
  return item;
}

/** Called after verified local save or an explicit local delete, never for dispatch uncertainty. */
export function markImageSubmissionHandled(book: ImageSubmissionBook, jobId: string) {
  if (!uuid.test(jobId)) throw new ImageSubmissionError();
  const item = book.submissions.find(x => x.jobId === jobId);
  if (item && !item.resultHandled) {
    item.resultHandled = true;
    item.revision++;
  }
  return item ?? null;
}
