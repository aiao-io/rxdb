import '@analogjs/vitest-angular/setup-snapshots';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';
import '@analogjs/vitest-angular/setup-zone';
import '@angular/compiler';

setupTestBed({ zoneless: false });

if (!globalThis.crypto?.subtle || !globalThis.crypto.randomUUID) {
  let randomUuidCounter = 0;
  const subtle = {
    digest: async (algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> => {
      void algorithm;
      void data;
      return new ArrayBuffer(32);
    }
  } as unknown as SubtleCrypto;
  const randomUUID = (): `${string}-${string}-${string}-${string}-${string}` => {
    randomUuidCounter += 1;
    return `10000000-0000-4000-8000-${String(randomUuidCounter).padStart(12, '0')}`;
  };
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle, randomUUID } as Crypto });
}
