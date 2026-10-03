import { createFakeAlipay, FAKE_USER_DATA_PATH, wasmBytes } from './__tests__/fake-alipay.js';
import {
  AlipayFsError,
  FRAME_HEADER,
  frameUserFiles,
  isAlipayFsFailure,
  listFiles,
  wrapAlipayFileSystem
} from './alipay-fs.js';
import { WASM_TEXT_SUFFIX } from './alipay-host.js';
import { describeError } from './describe-error.js';
import { VFS_MISSING_FILE_PATTERN, VFS_QUOTA_EXCEEDED_PATTERN, vfsSaysAlreadyExists } from './vfs-classifiers.js';

const MIB = 1024 * 1024;
const ROOT = `${FAKE_USER_DATA_PATH}/wrap`;

function setup(mode: 'ios' | 'simulator') {
  const fake = createFakeAlipay({ mode });
  const fileSystem = wrapAlipayFileSystem(fake.my.getFileSystemManager(), fake.my);
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

describe.each(['ios', 'simulator'] as const)('wrapAlipayFileSystem（%s 形态）', mode => {
  it('二进制往返：两端都按 base64 串 + base64 编码落盘，字节原样读回', () => {
    const { fake, fileSystem } = setup(mode);
    fileSystem.writeFileSync(`${ROOT}/a.bin`, Uint8Array.from([0x00, 0xff, 0x10, 0x80, 0x7f, 0x41]).buffer);
    expect(fileSystem.readFileSync(`${ROOT}/a.bin`, 'base64')).toBe('AP8QgH9B');
    expect([...(fake.files.get(`${ROOT}/a.bin`) ?? [])]).toEqual([0x00, 0xff, 0x10, 0x80, 0x7f, 0x41]);
    expect(fileSystem.statSync(`${ROOT}/a.bin`).size).toBe(6);
  });

  it('不存在：返回的错误对象变成抛错，文案命中 adapter VFS 的「不存在」正则，原始对象挂在 cause 上', () => {
    const { fileSystem } = setup(mode);
    const error = thrown(() => fileSystem.accessSync(`${ROOT}/missing`));
    expect(error).toBeInstanceOf(AlipayFsError);
    expect(error).toMatchObject({ method: 'accessSync', path: `${ROOT}/missing`, platformCode: 10022 });
    expect(VFS_MISSING_FILE_PATTERN.test((error as Error).message)).toBe(true);
    expect((error as Error).message).toContain('文件不存在');
    expect(describeError(error).cause).toMatchObject({ codes: { error: 10022 }, errorMessage: '文件不存在' });
  });

  it('已存在：mkdirSync(已存在, false) 的 10025 判为「已存在」', () => {
    const { fileSystem } = setup(mode);
    const error = thrown(() => fileSystem.mkdirSync(ROOT, false));
    expect(vfsSaysAlreadyExists((error as Error).message)).toBe(true);
  });

  it('超过单文件上限：10028 的文案命中 adapter VFS 的「撞配额」正则', () => {
    const { fileSystem } = setup(mode);
    const error = thrown(() => fileSystem.writeFileSync(`${ROOT}/big.bin`, new ArrayBuffer(11 * MIB)));
    expect(error).toMatchObject({ platformCode: 10028 });
    expect(VFS_QUOTA_EXCEEDED_PATTERN.test((error as Error).message)).toBe(true);
  });

  it('readdirSync 与 listFiles：递归列出文件及大小，路径相对根目录', () => {
    const { fileSystem } = setup(mode);
    fileSystem.mkdirSync(`${ROOT}/sub`, true);
    fileSystem.writeFileSync(`${ROOT}/x.0`, new ArrayBuffer(3));
    fileSystem.writeFileSync(`${ROOT}/sub/y.1`, new ArrayBuffer(5));
    expect(fileSystem.readdirSync(ROOT).sort()).toEqual(['sub', 'x.0']);
    expect(listFiles(fileSystem, ROOT).sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: '/sub/y.1', size: 5 },
      { path: '/x.0', size: 3 }
    ]);
  });

  it('rmdirSync(递归) 删掉整棵树', () => {
    const { fake, fileSystem } = setup(mode);
    fileSystem.writeFileSync(`${ROOT}/x`, new ArrayBuffer(1));
    fileSystem.rmdirSync(ROOT, true);
    expect(fake.directories.has(ROOT)).toBe(false);
    expect(fake.files.size).toBe(0);
  });

  it('readBinarySync 读代码包里的相对路径', () => {
    const { fileSystem } = setup(mode);
    expect(new Uint8Array(fileSystem.readBinarySync('wasm/add.wasm')).slice(0, 4)).toEqual(
      Uint8Array.from([0x00, 0x61, 0x73, 0x6d])
    );
  });
});

describe('wrapAlipayFileSystem：平台特有的错误形态', () => {
  it('模拟器内部错误 errorCode 90000：未知错误码原文照录，不冒充任何 VFS 分类', () => {
    const fake = createFakeAlipay({ mode: 'simulator' });
    const raw = fake.my.getFileSystemManager();
    const fileSystem = wrapAlipayFileSystem(
      { ...raw, accessSync: () => ({ errorCode: '90000', errorMessage: '内部错误' }) } as typeof raw,
      fake.my
    );
    const error = thrown(() => fileSystem.accessSync('/x'));
    expect(error).toMatchObject({ platformCode: '90000', message: '内部错误 (accessSync /x, error 90000)' });
  });

  it('成功返回里没有 ArrayBuffer：报出实际形状，不当成空文件', () => {
    const fake = createFakeAlipay();
    const raw = fake.my.getFileSystemManager();
    const fileSystem = wrapAlipayFileSystem(
      { ...raw, readFileSync: () => ({ data: 'AAAA', success: true }) } as typeof raw,
      fake.my
    );
    expect(() => fileSystem.readFileSync('/x', 'base64')).toThrow(/readFileSync \/x.*\[object String\]/);
  });

  it('iOS 能写空文件', () => {
    const { fake, fileSystem } = setup('ios');
    fileSystem.writeFileSync(`${ROOT}/empty.bin`, new ArrayBuffer(0));
    expect(fake.files.get(`${ROOT}/empty.bin`)?.byteLength).toBe(0);
    expect(fileSystem.readFileSync(`${ROOT}/empty.bin`, 'base64')).toBe('');
  });

  it('模拟器拒收任何空写入：error 2「接口参数无效」，文件不会建出来', () => {
    const { fake, fileSystem } = setup('simulator');
    const error = thrown(() => fileSystem.writeFileSync(`${ROOT}/empty.bin`, new ArrayBuffer(0)));
    expect(error).toMatchObject({ platformCode: 2, message: expect.stringContaining('接口参数无效') });
    expect(fake.files.has(`${ROOT}/empty.bin`)).toBe(false);
  });

  it('父目录不存在：iOS 报不存在，模拟器自动建出父目录', () => {
    for (const mode of ['ios', 'simulator'] as const) {
      const { fake, fileSystem } = setup(mode);
      const write = () => fileSystem.writeFileSync(`${ROOT}/x/y/z.bin`, new ArrayBuffer(1));
      if (mode === 'ios') {
        expect(write).toThrow(/文件不存在|目录不存在/);
        continue;
      }
      write();
      expect(fake.directories.has(`${ROOT}/x/y`)).toBe(true);
      expect(fileSystem.readdirSync(`${ROOT}/x`)).toEqual(['y']);
    }
  });

  it('模拟器的单文件上限按 base64 串长计：7 MiB 写得进、8 MiB 撞 10028（iOS 按字节，8 MiB 照样写得进）', () => {
    for (const mode of ['ios', 'simulator'] as const) {
      const { fileSystem } = setup(mode);
      fileSystem.writeFileSync(`${ROOT}/seven.bin`, new ArrayBuffer(7 * MIB));
      const eight = () => fileSystem.writeFileSync(`${ROOT}/eight.bin`, new ArrayBuffer(8 * MIB));
      if (mode === 'ios') expect(eight).not.toThrow();
      else expect(eight).toThrow(/size limit exceeded/);
    }
  });

  it('iOS 的 renameSync 覆盖已有目标，模拟器报已存在', () => {
    for (const mode of ['ios', 'simulator'] as const) {
      const { fileSystem } = setup(mode);
      fileSystem.writeFileSync(`${ROOT}/a`, new ArrayBuffer(1));
      fileSystem.writeFileSync(`${ROOT}/b`, new ArrayBuffer(2));
      const rename = () => fileSystem.renameSync(`${ROOT}/a`, `${ROOT}/b`);
      if (mode === 'ios') expect(rename).not.toThrow();
      else expect(rename).toThrow(/file already exists/);
    }
  });
});

describe.each(['ios', 'simulator'] as const)('frameUserFiles（%s 形态）', mode => {
  function framed() {
    const { fake, fileSystem } = setup(mode);
    return { fake, fileSystem: frameUserFiles(fileSystem, fake.my) };
  }

  it('空文件：落盘的是一个分帧头字节，读回是空串，大小按逻辑字节报 0', () => {
    const { fake, fileSystem } = framed();
    fileSystem.writeFileSync(`${ROOT}/empty.bin`, new ArrayBuffer(0));
    expect([...(fake.files.get(`${ROOT}/empty.bin`) ?? [])]).toEqual([FRAME_HEADER]);
    expect(fileSystem.readFileSync(`${ROOT}/empty.bin`, 'base64')).toBe('');
    expect(fileSystem.statSync(`${ROOT}/empty.bin`).size).toBe(0);
  });

  it('非空文件：分帧头在前、数据原样在后，读回与 listFiles 都看不到分帧头', () => {
    const { fake, fileSystem } = framed();
    fileSystem.writeFileSync(`${ROOT}/a.bin`, Uint8Array.from([0x00, 0xff, 0x10]).buffer);
    expect([...(fake.files.get(`${ROOT}/a.bin`) ?? [])]).toEqual([FRAME_HEADER, 0x00, 0xff, 0x10]);
    expect(fileSystem.readFileSync(`${ROOT}/a.bin`, 'base64')).toBe('AP8Q');
    expect(listFiles(fileSystem, ROOT)).toEqual([{ path: '/a.bin', size: 3 }]);
  });

  it('目录的 stats 原样返回', () => {
    const { fileSystem } = framed();
    fileSystem.mkdirSync(`${ROOT}/sub`, true);
    expect(fileSystem.statSync(`${ROOT}/sub`).isDirectory()).toBe(true);
  });

  it('不是经分帧层写的文件：读与 stat 都抛错，不猜它的内容', () => {
    const { fake, fileSystem } = framed();
    fake.files.set(`${ROOT}/raw.bin`, Uint8Array.from([0x42]));
    fake.files.set(`${ROOT}/zero.bin`, new Uint8Array(0));
    expect(() => fileSystem.readFileSync(`${ROOT}/raw.bin`, 'base64')).toThrow('分帧头');
    expect(() => fileSystem.statSync(`${ROOT}/zero.bin`)).toThrow('分帧头');
  });

  it('平台错误照旧抛 AlipayFsError；readBinarySync 读代码包不经分帧', () => {
    const { fileSystem } = framed();
    expect(thrown(() => fileSystem.accessSync(`${ROOT}/missing`))).toBeInstanceOf(AlipayFsError);
    expect(new Uint8Array(fileSystem.readBinarySync('wasm/add.wasm')).slice(0, 4)).toEqual(
      Uint8Array.from([0x00, 0x61, 0x73, 0x6d])
    );
  });
});

describe('代码包读取', () => {
  it('readTextSync 读 base64 文本副本：两端都原样，解码后就是 wasm 字节', () => {
    for (const mode of ['ios', 'simulator'] as const) {
      const { fileSystem } = setup(mode);
      const text = fileSystem.readTextSync(`wa-sqlite/wa-sqlite.wasm${WASM_TEXT_SUFFIX}`);
      expect(Buffer.from(text, 'base64').equals(Buffer.from(wasmBytes))).toBe(true);
    }
  });

  it('模拟器把代码包文件当 UTF-8 文本读：非法序列变成 EF BF BD，二进制读不回原样', () => {
    const ios = new Uint8Array(setup('ios').fileSystem.readBinarySync('wa-sqlite/wa-sqlite.wasm'));
    const simulator = new Uint8Array(setup('simulator').fileSystem.readBinarySync('wa-sqlite/wa-sqlite.wasm'));
    expect(ios).toEqual(wasmBytes);
    // 开发者工具 3.10.15 实测：727646 字节读成 814795 字节，Type 段长度字节 0xd7 变成 EF BF BD
    expect([...simulator.slice(8, 12)]).toEqual([0x01, 0xef, 0xbf, 0xbd]);
    expect(simulator.byteLength).toBeGreaterThan(wasmBytes.byteLength);
  });

  it('readTextSync 读不存在的文件照旧抛 AlipayFsError', () => {
    const { fileSystem } = setup('simulator');
    expect(thrown(() => fileSystem.readTextSync('nope.txt'))).toMatchObject({ platformCode: 10022 });
  });
});
