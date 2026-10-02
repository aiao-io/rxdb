import { prepareMiniProgramHostRuntime } from '@aiao/rxdb-adapter-miniprogram/runtime';
import { createFakeDouyin, FAKE_USER_DATA_PATH } from './__tests__/fake-douyin.js';
import type { DouyinApi } from './douyin-api.js';
import { createDouyinSpikeHost, DOUYIN_DEFAULT_WASM_PATH } from './spike-host.js';

function withRandom(getRandomValues: DouyinApi['getRandomValues']): DouyinApi {
  return { ...createFakeDouyin().tt, getRandomValues };
}

describe('createDouyinSpikeHost', () => {
  it('借用已登记的 wechat id，名称全部指向抖音', () => {
    const { tt } = createFakeDouyin();
    const host = createDouyinSpikeHost(tt);
    expect(host).toMatchObject({
      platform: 'wechat',
      shortName: '抖音',
      wasmRuntimeName: 'TTWebAssembly',
      capabilityNames: { fileSystem: 'tt.getFileSystemManager', userDataPath: 'tt.env.USER_DATA_PATH' },
      userDataPath: FAKE_USER_DATA_PATH
    });
    expect(host.displayName).toContain('抖音');
    expect(host.getFileSystemManager()).toBe(tt.getFileSystemManager());
  });

  it('声明分块布局与代码包根的绝对 wasm 路径；没给真实全局对象时不设 runtimeGlobal', () => {
    const host = createDouyinSpikeHost(createFakeDouyin().tt);
    expect(host.fileLayout).toEqual({ kind: 'chunked', chunkBytes: 65_536 });
    expect(host.defaultWasmPath).toBe(DOUYIN_DEFAULT_WASM_PATH);
    expect(DOUYIN_DEFAULT_WASM_PATH.startsWith('/')).toBe(true);
    expect(host).not.toHaveProperty('runtimeGlobal');
  });

  it('banner 找到的真实全局对象原样交给 adapter', () => {
    const host = createDouyinSpikeHost(createFakeDouyin().tt, globalThis);
    expect(host.runtimeGlobal).toBe(globalThis);
  });

  it('能通过 adapter 的平台 id 校验', async () => {
    await expect(prepareMiniProgramHostRuntime(createDouyinSpikeHost(createFakeDouyin().tt))).resolves.toBeDefined();
  });

  it('按要求的长度返回新分配的随机池', async () => {
    const host = createDouyinSpikeHost(createFakeDouyin().tt);
    const first = await host.requestRandomValues(65_536);
    const second = await host.requestRandomValues(65_536);
    expect(first.byteLength).toBe(65_536);
    expect(first.buffer).not.toBe(second.buffer);
  });

  it('缺 tt.getRandomValues 时 reject，不降级', async () => {
    const host = createDouyinSpikeHost(createFakeDouyin({ withoutRandomValues: true }).tt);
    await expect(host.requestRandomValues(16)).rejects.toThrow('缺少 tt.getRandomValues');
  });

  it('fail 回调带上原始错误作为 cause', async () => {
    const raw = { errMsg: 'getRandomValues:fail denied' };
    const host = createDouyinSpikeHost(withRandom(({ fail }) => fail?.(raw)));
    await expect(host.requestRandomValues(16)).rejects.toMatchObject({
      message: 'tt.getRandomValues 失败: getRandomValues:fail denied',
      cause: raw
    });
  });

  it('长度不符时 reject，而不是在回调里吞掉', async () => {
    const host = createDouyinSpikeHost(withRandom(({ success }) => success?.({ randomValues: new ArrayBuffer(8) })));
    await expect(host.requestRandomValues(16)).rejects.toThrow('返回 8 bytes，期望 16 bytes');
  });

  it('调用同步抛错时 reject', async () => {
    const host = createDouyinSpikeHost(
      withRandom(() => {
        throw new Error('同步炸了');
      })
    );
    await expect(host.requestRandomValues(16)).rejects.toThrow('tt.getRandomValues 失败: 同步炸了');
  });
});
