import { OrbitError } from './errors.js';
import type { OrbitProps, OrbitValue } from './types.js';

const MAX_BYTES = 1024 * 1024;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isContainer(value: object): boolean {
  return (
    Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null
  );
}

function checkValues(value: unknown): void {
  const ancestors = new Set<object>();
  let count = 0;
  const visit = (current: unknown, depth: number): void => {
    if (++count > MAX_BYTES || depth > 32) throw new Error('数据规模或嵌套超限');
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return;
    if (typeof current === 'number' && Number.isFinite(current)) return;
    if (typeof current !== 'object' || !isContainer(current)) throw new Error('只允许 JSON 值');
    if (ancestors.has(current)) throw new Error('不接受循环引用');
    ancestors.add(current);
    for (const child of Object.values(current)) visit(child, depth + 1);
    ancestors.delete(current);
  };
  visit(value, 0);
}

export function copyValue(value: unknown): OrbitValue {
  try {
    checkValues(value);
    const encoded = JSON.stringify(value);
    if (new TextEncoder().encode(encoded).byteLength > MAX_BYTES) throw new Error('消息超过 1 MiB');
    return JSON.parse(encoded) as OrbitValue;
  } catch (cause) {
    throw new OrbitError('INVALID_PAYLOAD', '消息必须是 1 MiB 内且深度不超过 32 的 JSON 数据', { cause });
  }
}

export function copyProps(value: unknown): OrbitProps {
  if (!isRecord(value)) throw new OrbitError('INVALID_PAYLOAD', 'props 必须是 JSON 对象');
  return Object.freeze(copyValue(value) as Record<string, OrbitValue>);
}
