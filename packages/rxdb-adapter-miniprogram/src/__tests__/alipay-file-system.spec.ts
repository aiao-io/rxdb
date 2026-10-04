/**
 * 支付宝同步 FS 包装：错误对象 → 抛错、base64 往返、分帧头、代码包读取。语义取自 US-211 支付宝探针 v2–v6，
 * 见 {@link createFakeAlipay}。
 */
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { MiniProgramAlipayRawFileSystem } from '../hosts/alipay-api.js';
import {
  ALIPAY_FRAME_HEADER,
  AlipayFsError,
  createAlipayCodePackageReader,
  createAlipayFileSystem,
  isAlipayFsFailure
} from '../hosts/alipay-file-system.js';
import { createFakeAlipay, FAKE_ALIPAY_USER_DATA_PATH } from './fake-alipay.js';
import { wasmBytes } from './subframe-wasm-factory.js';

const MIB = 1024 * 1024;
const ROOT = `${FAKE_ALIPAY_USER_DATA_PATH}/wrap`;

function setup(mode: 'ios' | 'simulator') {
  const fake = createFakeAlipay({ mode });
  const fileSystem = createAlipayFileSystem(fake.my.getFileSystemManager(), fake.my);
  fileSystem.mkdirSync(ROOT, true);
  return { fake, fileSystem };
}

function thrown(task: () => unknown): unknown {
  try {
    task();
  } catch (error) {
    return error;
  }
  throw new Error('应当抛错');
}

function withRaw(overrides: Partial<Record<keyof MiniProgramAlipayRawFileSystem, unknown>>) {
  const fake = createFakeAlipay({ mode: 'simulator' });
  // 替身是类实例，方法在原型上：用原型链叠加覆盖，展开会丢方法
  const raw = Object.assign(Object.create(fake.my.getFileSystemManager()) as object, overrides);
  return { raw, fileSystem: createAlipayFileSystem(raw as MiniProgramAlipayRawFileSystem, fake.my) };
}

describe('isAlipayFsFailure', () => {
  it.each([
    [{ error: 10022, errorMessage: '文件不存在' }, true],
    [{ errorCode: '90000', errorMessage: '内部错误' }, true],
    [{ success: true }, false],
    [undefined, false],
    ['error', false]
  ])('%j → %s', (value, expected) => {
    expect(isAlipayFsFailure(value)).toBe(expected);
  });
});

describe.each(['ios', 'simulator'] as const)('createAlipayFileSystem（%s 形态）', mode => {
  it('写入只走「base64 串 + base64 编码」，落盘是分帧头加原样字节，读回不带分帧头', () => {
    const { fake, fileSystem } = setup(mode);
    fileSystem.writeFileSync(`${ROOT}/a.bin`, Uint8Array.from([0x00, 0xff, 0x10, 0x80, 0x7f, 0x41]).buffer);

    expect(fake.writes.at(-1)).toEqual({ path: `${ROOT}/a.bin`, data: 'oQD/EIB/QQ==', encoding: 'base64' });
    expect([...(fake.files.get(`${ROOT}/a.bin`) ?? [])]).toEqual([
      ALIPAY_FRAME_HEADER,
      0,
      0xff,
      0x10,
      0x80,
      0x7f,
      0x41
    ]);
    expect(fileSystem.readFileSync(`${ROOT}/a.bin`, 'base64')).toBe('AP8QgH9B');
  });

  it('空文件：落盘一个分帧头字节，读回空串（模拟器拒收空写入）', () => {
    const { fake, fileSystem } = setup(mode);
    fileSystem.writeFileSync(`${ROOT}/empty.bin`, new ArrayBuffer(0));

    expect([...(fake.files.get(`${ROOT}/empty.bin`) ?? [])]).toEqual([ALIPAY_FRAME_HEADER]);
    expect(fileSystem.readFileSync(`${ROOT}/empty.bin`, 'base64')).toBe('');
  });

  it('10022 变成抛错，文案以 no such file or directory 开头，原始对象挂在 cause 上', () => {
    const { fileSystem } = setup(mode);
    const error = thrown(() => fileSystem.accessSync(`${ROOT}/missing`));

    expect(error).toBeInstanceOf(AlipayFsError);
    expect(error).toMatchObject({
      method: 'accessSync',
      path: `${ROOT}/missing`,
      platformCode: 10022,
      message: `no such file or directory: 文件不存在 (accessSync ${ROOT}/missing, error 10022)`,
      cause: { error: 10022, errorMessage: '文件不存在' }
    });
  });

  it('10025 的文案以 file already exists 开头', () => {
    const { fileSystem } = setup(mode);

    expect(thrown(() => fileSystem.mkdirSync(ROOT, false))).toMatchObject({
      platformCode: 10025,
      message: expect.stringMatching(/^file already exists: 有同名文件或目录/)
    });
  });

  it('10028 的文案以 size limit exceeded 开头', () => {
    const { fileSystem } = setup(mode);

    expect(thrown(() => fileSystem.writeFileSync(`${ROOT}/big.bin`, new ArrayBuffer(11 * MIB)))).toMatchObject({
      platformCode: 10028,
      message: expect.stringMatching(/^size limit exceeded: 写入文件单个超过 10M/)
    });
  });

  it('unlinkSync 删文件；删不存在的文件报 10022', () => {
    const { fake, fileSystem } = setup(mode);
    fileSystem.writeFileSync(`${ROOT}/x`, new ArrayBuffer(1));
    fileSystem.unlinkSync(`${ROOT}/x`);

    expect(fake.files.has(`${ROOT}/x`)).toBe(false);
    expect(thrown(() => fileSystem.unlinkSync(`${ROOT}/x`))).toMatchObject({ platformCode: 10022 });
  });
});

describe('createAlipayFileSystem：形态不对时如实报错', () => {
  it('未知错误码原文照录，不冒充任何 VFS 分类', () => {
    const { fileSystem } = withRaw({ accessSync: () => ({ errorCode: '90000', errorMessage: '内部错误' }) });

    expect(thrown(() => fileSystem.accessSync('/x'))).toMatchObject({
      platformCode: '90000',
      message: '内部错误 (accessSync /x, error 90000)'
    });
  });

  it('失败对象没有任何文案时照录整个对象', () => {
    const { fileSystem } = withRaw({ accessSync: () => ({ error: 7 }) });

    expect(thrown(() => fileSystem.accessSync('/x'))).toMatchObject({
      message: '{"error":7} (accessSync /x, error 7)'
    });
  });

  it('成功返回里 data 不是 ArrayBuffer：报出实际形状，不当成空文件', () => {
    const { fileSystem } = withRaw({ readFileSync: () => ({ data: 'AAAA', success: true }) });

    expect(() => fileSystem.readFileSync('/x', 'base64')).toThrow(
      'readFileSync /x 返回的 data 是 [object String]，期望 [object ArrayBuffer]'
    );
  });

  it('别的 realm 的 ArrayBuffer 照样认（模拟器实测 instanceof 恒为假，按内部标签判断）', () => {
    const foreign: unknown = runInNewContext('new Uint8Array([0xa1, 0x41]).buffer');
    const { fileSystem } = withRaw({ readFileSync: () => ({ data: foreign, success: true }) });

    expect(foreign instanceof ArrayBuffer).toBe(false);
    expect(fileSystem.readFileSync('/x', 'base64')).toBe('QQ==');
  });

  it('不是经分帧层写的文件：读时抛错，不猜它的内容', () => {
    const fake = createFakeAlipay();
    const fileSystem = createAlipayFileSystem(fake.my.getFileSystemManager(), fake.my);
    fake.files.set(`${FAKE_ALIPAY_USER_DATA_PATH}/raw.bin`, Uint8Array.from([0x42]));
    fake.files.set(`${FAKE_ALIPAY_USER_DATA_PATH}/zero.bin`, new Uint8Array(0));

    expect(() => fileSystem.readFileSync(`${FAKE_ALIPAY_USER_DATA_PATH}/raw.bin`, 'base64')).toThrow(
      `readFileSync ${FAKE_ALIPAY_USER_DATA_PATH}/raw.bin 不是经分帧层写的文件（首字节 66），缺分帧头`
    );
    expect(() => fileSystem.readFileSync(`${FAKE_ALIPAY_USER_DATA_PATH}/zero.bin`, 'base64')).toThrow(
      '（首字节 undefined），缺分帧头'
    );
  });

  it('原始 FS 缺的方法不包装，交给运行时预检报缺失', () => {
    const { fileSystem } = withRaw({ unlinkSync: undefined, writeFileSync: undefined });

    expect(Object.keys(fileSystem).sort()).toEqual(['accessSync', 'mkdirSync', 'readFileSync']);
  });
});

describe('createAlipayCodePackageReader', () => {
  it('iOS 二进制读回原样，代码包里没有文本副本（10022）', () => {
    const reader = createAlipayCodePackageReader(createFakeAlipay({ mode: 'ios' }).my.getFileSystemManager());

    expect(Buffer.from(reader.readBinarySync('wa-sqlite/wa-sqlite.wasm')).equals(Buffer.from(wasmBytes))).toBe(true);
    expect(thrown(() => reader.readTextSync('wa-sqlite/wa-sqlite.wasm.base64.txt'))).toMatchObject({
      platformCode: 10022
    });
  });

  it('模拟器把二进制当 UTF-8 文本读：非法序列变成 EF BF BD；文本副本读回原样', () => {
    const reader = createAlipayCodePackageReader(createFakeAlipay({ mode: 'simulator' }).my.getFileSystemManager());
    const binary = new Uint8Array(reader.readBinarySync('wa-sqlite/wa-sqlite.wasm'));
    const text = reader.readTextSync('wa-sqlite/wa-sqlite.wasm.base64.txt');

    // 开发者工具实测：727646 字节读成 814795 字节，Type 段长度字节 0xd7 变成 EF BF BD
    expect([...binary.slice(8, 12)]).toEqual([0x01, 0xef, 0xbf, 0xbd]);
    expect(Buffer.from(text, 'base64').equals(Buffer.from(wasmBytes))).toBe(true);
  });

  it('readTextSync 的 data 不是字符串时报出实际形状', () => {
    const fake = createFakeAlipay();
    const raw = { ...fake.my.getFileSystemManager(), readFileSync: () => ({ data: new ArrayBuffer(1) }) };

    expect(() => createAlipayCodePackageReader(raw).readTextSync('a.txt')).toThrow(
      'readFileSync a.txt 返回的 data 是 [object ArrayBuffer]，期望 [object String]'
    );
  });
});
