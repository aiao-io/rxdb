import {
  addWasmBytes,
  createFakeAlipay,
  FAKE_USER_DATA_PATH,
  fakeWasmFingerprints,
  wasmBytes
} from './__tests__/fake-alipay.js';
import { wrapAlipayFileSystem } from './alipay-fs.js';
import { createAlipayProbeHost, createAlipayWasmRuntime, readCodePackageWasm } from './alipay-host.js';
import { fingerprintWasm } from './wasm-fingerprint.js';

function setup(options: Parameters<typeof createFakeAlipay>[0] = {}) {
  const fake = createFakeAlipay(options);
  const fileSystem = wrapAlipayFileSystem(fake.my.getFileSystemManager(), fake.my);
  return { fake, fileSystem };
}

describe('createAlipayProbeHost', () => {
  it('借用 wechat 平台 id，能力名、存储布局按支付宝声明，不设 defaultWasmPath', () => {
    const { fake, fileSystem } = setup();
    const host = createAlipayProbeHost(fake.my, fileSystem, async length => new Uint8Array(length));
    expect(host).toMatchObject({
      platform: 'wechat',
      displayName: '支付宝小程序（实验）',
      shortName: '支付宝',
      wasmRuntimeName: 'WebAssembly',
      capabilityNames: { fileSystem: 'my.getFileSystemManager', userDataPath: 'my.env.USER_DATA_PATH' },
      userDataPath: FAKE_USER_DATA_PATH,
      fileLayout: { kind: 'chunked', chunkBytes: 64 * 1024 }
    });
    expect(host).not.toHaveProperty('defaultWasmPath');
    expect(host).not.toHaveProperty('runtimeGlobal');
    expect(host.getFileSystemManager()).toBe(fileSystem);
  });

  it('runtimeGlobal 只在传入时出现', () => {
    const { fake, fileSystem } = setup();
    const host = createAlipayProbeHost(fake.my, fileSystem, async length => new Uint8Array(length), globalThis);
    expect(host.runtimeGlobal).toBe(globalThis);
  });

  it.each([[''], [undefined]])('USER_DATA_PATH 为 %j 时 userDataPath 是 undefined，交给预检报缺失', path => {
    const { fake, fileSystem } = setup();
    const my = { ...fake.my, env: { USER_DATA_PATH: path } };
    expect(createAlipayProbeHost(my, fileSystem, async () => new Uint8Array(0)).userDataPath).toBeUndefined();
  });

  it('requestRandomValues 原样委托，不改长度也不包装错误', async () => {
    const { fake, fileSystem } = setup();
    const request = vi.fn(async (length: number) => Uint8Array.from({ length }, () => 7));
    const host = createAlipayProbeHost(fake.my, fileSystem, request);
    await expect(host.requestRandomValues(3)).resolves.toEqual(Uint8Array.from([7, 7, 7]));
    expect(request).toHaveBeenCalledWith(3);
    const failing = createAlipayProbeHost(fake.my, fileSystem, () => Promise.reject(new Error('worker 挂了')));
    await expect(failing.requestRandomValues(1)).rejects.toThrow('worker 挂了');
  });
});

describe('readCodePackageWasm', () => {
  it('iOS 形态：.wasm 原文件与构建指纹一致，直接用原文件', () => {
    const { fake, fileSystem } = setup({ mode: 'ios' });
    const result = readCodePackageWasm(fileSystem, fake.my, fakeWasmFingerprints, 'wa-sqlite/wa-sqlite.wasm');
    expect(result.source).toBe('binary');
    expect(Buffer.from(result.bytes).equals(Buffer.from(wasmBytes))).toBe(true);
  });

  it('模拟器形态：二进制读被改写、与指纹不符，改用 base64 文本副本', () => {
    const { fake, fileSystem } = setup({ mode: 'simulator' });
    const result = readCodePackageWasm(fileSystem, fake.my, fakeWasmFingerprints, 'wa-sqlite/wa-sqlite.wasm');
    expect(result.source).toBe('textCopy');
    expect(Buffer.from(result.bytes).equals(Buffer.from(wasmBytes))).toBe(true);
  });

  it('原文件与指纹不符、又没有文本副本：抛错，带上两边字节数，FS 错误挂在 cause 上', () => {
    const { fake, fileSystem } = setup({ mode: 'ios' });
    const stale = { 'wa-sqlite/wa-sqlite.wasm': fingerprintWasm(wasmBytes.slice(1)) };
    let thrown: unknown;
    try {
      readCodePackageWasm(fileSystem, fake.my, stale, 'wa-sqlite/wa-sqlite.wasm');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      message: expect.stringContaining(`${String(wasmBytes.byteLength)} / ${String(wasmBytes.byteLength - 1)} 字节`),
      cause: { platformCode: 10022 }
    });
  });

  it('文本副本解码后也与指纹不符：抛错，不把改写过的字节交出去', () => {
    const { fake, fileSystem } = setup({ mode: 'simulator' });
    const stale = { 'wa-sqlite/wa-sqlite.wasm': fingerprintWasm(addWasmBytes) };
    expect(() => readCodePackageWasm(fileSystem, fake.my, stale, 'wa-sqlite/wa-sqlite.wasm')).toThrow(
      '文本副本解码后与构建指纹不符'
    );
  });

  it('构建没记指纹的路径：先于读文件抛错', () => {
    const { fake, fileSystem } = setup();
    expect(() => readCodePackageWasm(fileSystem, fake.my, {}, 'wasm/add.wasm')).toThrow('构建没给 wasm/add.wasm 记指纹');
  });

  it('原文件不存在：把 FS 错误原样抛出', () => {
    const { fake, fileSystem } = setup();
    const fingerprints = { 'nope.wasm': fingerprintWasm(addWasmBytes) };
    expect(() => readCodePackageWasm(fileSystem, fake.my, fingerprints, 'nope.wasm')).toThrow(
      expect.objectContaining({ platformCode: 10022 })
    );
  });
});

describe('createAlipayWasmRuntime', () => {
  it.each(['ios', 'simulator'] as const)(
    '%s 形态：按指纹选源后交给逻辑层的标准 WebAssembly 实例化',
    async mode => {
      const { fake, fileSystem } = setup({ mode });
      if (!fake.wasm) throw new Error('替身应当有 WebAssembly');
      const runtime = createAlipayWasmRuntime(fileSystem, fake.wasm, fake.my, fakeWasmFingerprints);
      const result = await runtime.instantiate('wasm/add.wasm', {});
      const instance = 'instance' in result ? result.instance : result;
      expect((instance.exports['add'] as (a: number, b: number) => number)(2, 3)).toBe(5);
    }
  );

  it('读到的是实际字节：不会把别的文件当 wasm', async () => {
    const { fake, fileSystem } = setup();
    if (!fake.wasm) throw new Error('替身应当有 WebAssembly');
    const instantiate = vi.fn(fake.wasm.instantiate);
    await createAlipayWasmRuntime(fileSystem, { instantiate }, fake.my, fakeWasmFingerprints).instantiate(
      'wasm/add.wasm',
      {}
    );
    expect([...(instantiate.mock.calls[0][0] as Uint8Array)]).toEqual([...addWasmBytes]);
  });

  it('选源失败时 instantiate reject，不调 WebAssembly', async () => {
    const { fake, fileSystem } = setup();
    const instantiate = vi.fn();
    await expect(
      createAlipayWasmRuntime(fileSystem, { instantiate }, fake.my, {}).instantiate('wasm/add.wasm', {})
    ).rejects.toThrow('记指纹');
    expect(instantiate).not.toHaveBeenCalled();
  });
});
