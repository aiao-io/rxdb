/**
 * @fileoverview T081 — AES-GCM-256 加解密在 1 KiB 负载上的微基准冒烟测试。
 *
 * 执行热路径并在 CI 日志中输出 p95 耗时。这里的性能预算仅供参考；
 * 墙钟时间断言应放在专用基准任务中，而不是单元测试目标中。
 *
 * 输出也会写入 stdout，这样无需专用基准报告器就能出现在 CI 日志中。
 */

import { describe, expect, it } from 'vitest';

import { aesGcmDecrypt, aesGcmEncrypt, generateIV, randomBytes } from '../crypto.js';
import { buildAAD } from '../envelope.js';

const PAYLOAD_BYTES = 1024;
const SAMPLES = 500;
const WARMUP = 50;

async function importAesKey(): Promise<CryptoKey> {
  const raw = randomBytes(32);
  return crypto.subtle.importKey('raw', raw.slice().buffer, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function percentile(samples: ReadonlyArray<number>, p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function summarise(label: string, samples: ReadonlyArray<number>) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  console.log(
    `[bench:aes-gcm] ${label} (n=${samples.length}, ${PAYLOAD_BYTES}B): ` +
      `min=${min.toFixed(3)}ms avg=${avg.toFixed(3)}ms ` +
      `p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms ` +
      `max=${max.toFixed(3)}ms`
  );
  return { p95 };
}

describe('AES-GCM-256 micro-benchmark — 1 KiB cell', () => {
  it('round-trips 1 KiB cells and reports encrypt/decrypt p95', async () => {
    const key = await importAesKey();
    const plaintext = randomBytes(PAYLOAD_BYTES);
    const aad = buildAAD({
      databaseNamespace: 'bench-db',
      entityNamespace: 'bench',
      tableName: 'cells',
      columnName: 'value',
      primaryKey: 'row-1',
      kid: 'benchkid0'
    });

    // ---- 加密样本 -----------------------------------------------------------
    const ciphertexts: Array<{ ct: Uint8Array; tag: Uint8Array; iv: Uint8Array }> = [];
    const encryptSamples: number[] = [];
    for (let i = 0; i < WARMUP + SAMPLES; i++) {
      const iv = generateIV();
      const start = performance.now();
      const { ct, tag } = await aesGcmEncrypt({ key, iv, plaintext, aad });
      const elapsed = performance.now() - start;
      if (i >= WARMUP) encryptSamples.push(elapsed);
      ciphertexts.push({ ct, tag, iv });
    }
    summarise('encrypt', encryptSamples);

    // ---- 解密样本 -----------------------------------------------------------
    const decryptSamples: number[] = [];
    for (let i = WARMUP; i < ciphertexts.length; i++) {
      const { ct, tag, iv } = ciphertexts[i];
      const start = performance.now();
      const recovered = await aesGcmDecrypt({ key, iv, ct, tag, aad });
      const elapsed = performance.now() - start;
      decryptSamples.push(elapsed);
      // sanity (don't time)
      if (i === WARMUP) expect(recovered.byteLength).toBe(PAYLOAD_BYTES);
    }
    summarise('decrypt', decryptSamples);
  }, 60_000);
});
