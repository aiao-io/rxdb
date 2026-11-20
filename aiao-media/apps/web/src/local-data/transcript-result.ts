import { validateTranscriptResult, type TranscriptResult } from '@aiao-media/api-contracts';

export type LocalTranscriptResult = TranscriptResult;
export class TranscriptResultError extends Error {
  constructor(message = 'Transcript 结果无效。') {
    super(message);
    this.name = 'TranscriptResultError';
  }
}
export function transcriptText(value: unknown): TranscriptResult {
  try {
    return validateTranscriptResult(value);
  } catch {
    throw new TranscriptResultError();
  }
}
export function transcriptDownload(result: unknown): Blob {
  const value = transcriptText(result);
  return new Blob([`${value.text}\n`], { type: 'text/plain;charset=utf-8' });
}
