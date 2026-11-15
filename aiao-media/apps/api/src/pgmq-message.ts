export interface PgmqGenerationMessage {
  taskId: string;
  taskRevision: number;
  kind: 'image-generation';
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function isPgmqGenerationMessage(value: unknown): value is PgmqGenerationMessage {
  if (!isRecord(value) || Object.keys(value).length !== 3) return false;
  return (
    typeof value['taskId'] === 'string' &&
    uuidPattern.test(value['taskId']) &&
    typeof value['taskRevision'] === 'number' &&
    Number.isSafeInteger(value['taskRevision']) &&
    value['taskRevision'] > 0 &&
    value['kind'] === 'image-generation'
  );
}

export function parsePgmqGenerationMessage(value: unknown): PgmqGenerationMessage {
  if (!isPgmqGenerationMessage(value)) throw new Error('PGMQ 消息必须只包含有效的任务标识、修订号和类型。');
  return value;
}

export function serializePgmqGenerationMessage(value: PgmqGenerationMessage): string {
  return JSON.stringify(parsePgmqGenerationMessage(value));
}
