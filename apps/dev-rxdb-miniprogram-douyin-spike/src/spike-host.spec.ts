import { prepareMiniProgramHostRuntime } from '@aiao/rxdb-adapter-miniprogram/runtime';
import { createFakeDouyin, FAKE_USER_DATA_PATH } from './__tests__/fake-douyin.js';
import type { DouyinApi } from './douyin-api.js';
import { createDouyinSpikeHost } from './spike-host.js';

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
