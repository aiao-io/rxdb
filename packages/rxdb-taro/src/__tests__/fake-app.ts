import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 假 app 里 adapter 自己依赖的 wasm 字节（wasm 魔数开头）。 */
export const FAKE_WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x02]);

/** 假 adapter 包里的 Worker 源码。 */
export const FAKE_WORKER = '/* fake alipay random worker */';

function writePackage(dir: string, packageJson: object, files: Record<string, string | Buffer>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(packageJson));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
}

/**
 * 在临时目录造一个装了假 adapter 的 app：wasm 只放在 adapter 自己的 node_modules 里，
 * 解析得到它就说明走的是「app 根 → adapter → wasm」这条依赖链。
 *
 * @returns app 根目录
 */
export function createFakeApp(): string {
  const appRoot = mkdtempSync(join(tmpdir(), 'rxdb-taro-app-'));
  const adapterDir = join(appRoot, 'node_modules/@aiao/rxdb-adapter-miniprogram');
  writePackage(appRoot, { name: 'fake-app' }, {});
  writePackage(
    adapterDir,
    {
      name: '@aiao/rxdb-adapter-miniprogram',
      exports: { './package.json': './package.json', './alipay-random-worker.js': './worker.js' }
    },
    { 'worker.js': FAKE_WORKER }
  );
  writePackage(
    join(adapterDir, 'node_modules/@subframe7536/sqlite-wasm'),
    { name: '@subframe7536/sqlite-wasm', exports: { './wasm': './fake.wasm' } },
    { 'fake.wasm': FAKE_WASM }
  );
  return appRoot;
}
