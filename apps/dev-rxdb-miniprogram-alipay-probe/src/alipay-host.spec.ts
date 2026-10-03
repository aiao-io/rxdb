import { addWasmBytes, createFakeAlipay, FAKE_USER_DATA_PATH, wasmBytes } from './__tests__/fake-alipay.js';
import { wrapAlipayFileSystem } from './alipay-fs.js';
import { createAlipayProbeHost, createAlipayWasmRuntime } from './alipay-host.js';

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

describe('createAlipayWasmRuntime', () => {
  it('读代码包里的 base64 文本副本，解码后交给逻辑层的标准 WebAssembly 实例化', async () => {
    const { fake, fileSystem } = setup();
    if (!fake.wasm) throw new Error('替身应当有 WebAssembly');
    const runtime = createAlipayWasmRuntime(fileSystem, fake.wasm, fake.my);
    const result = await runtime.instantiate('wasm/add.wasm', {});
    const instance = 'instance' in result ? result.instance : result;
    expect((instance.exports['add'] as (a: number, b: number) => number)(2, 3)).toBe(5);
  });

  it('读到的是实际字节：不会把别的文件当 wasm', async () => {
    const { fake, fileSystem } = setup();
    if (!fake.wasm) throw new Error('替身应当有 WebAssembly');
    const instantiate = vi.fn(fake.wasm.instantiate);
    await createAlipayWasmRuntime(fileSystem, { instantiate }, fake.my).instantiate('wasm/add.wasm', {});
    expect([...(instantiate.mock.calls[0][0] as Uint8Array)]).toEqual([...addWasmBytes]);
  });

  it('模拟器上二进制读会改写字节，文本副本照样拿到原样的 wa-sqlite.wasm', async () => {
    const { fake, fileSystem } = setup({ mode: 'simulator' });
    const instantiate = vi.fn(async (_bytes: Uint8Array) => ({ instance: { exports: {} } }));
    await createAlipayWasmRuntime(fileSystem, { instantiate }, fake.my).instantiate('wa-sqlite/wa-sqlite.wasm', {});
    expect(Buffer.from(instantiate.mock.calls[0][0]).equals(Buffer.from(wasmBytes))).toBe(true);
  });

  it('文件不存在时把 FS 错误原样抛出', async () => {
    const { fake, fileSystem } = setup();
    if (!fake.wasm) throw new Error('替身应当有 WebAssembly');
    await expect(
      createAlipayWasmRuntime(fileSystem, fake.wasm, fake.my).instantiate('nope.wasm', {})
    ).rejects.toMatchObject({
      platformCode: 10022
    });
  });
});
