import { parseAppVersions, parsePlatform, parseRuntimeHealth } from './tauri-contracts';

describe('parsePlatform', () => {
  it('passes through the target os Rust reports', () => {
    expect(parsePlatform('macos')).toBe('macos');
  });

  it.each([undefined, null, 42, '', '   ', {}, ['macos']])('rejects %j', value => {
    expect(() => parsePlatform(value)).toThrow(/get_platform/);
  });
});

describe('parseAppVersions', () => {
  it('keeps the only key Rust actually sends', () => {
    expect(parseAppVersions({ tauri: '2.9.1' })).toEqual({ tauri: '2.9.1' });
  });

  // TAURI-02：Rust 的 `get_versions` 只塞了 `tauri`。前端曾声明 `node`/`chrome`
  // 也可选存在，于是这两个字段永远是 undefined 却没人发现。契约收窄后，
  // 多出来的键必须被丢掉，避免它们再次悄悄爬回类型里。
  it('drops keys Rust never sends', () => {
    expect(parseAppVersions({ tauri: '2.9.1', node: '22.0.0', chrome: '130' })).toEqual({ tauri: '2.9.1' });
  });

  it.each([undefined, null, {}, { tauri: 2 }, { tauri: '' }, { node: '22.0.0' }])('rejects %j', value => {
    expect(() => parseAppVersions(value)).toThrow(/get_versions/);
  });
});

describe('parseRuntimeHealth', () => {
  it('passes through the reported status', () => {
    expect(parseRuntimeHealth({ status: 'ready' })).toEqual({ status: 'ready' });
  });

  // 状态值本身不由解析层裁决：解析只保证形状，"是不是 ready" 交给调用方判断，
  // 否则一个非 ready 的后端会以 "解析失败" 的面目出现，诊断信息全丢。
  it('does not reject a status other than ready', () => {
    expect(parseRuntimeHealth({ status: 'degraded' })).toEqual({ status: 'degraded' });
  });

  it.each([undefined, null, {}, { status: 1 }, { status: '' }])('rejects %j', value => {
    expect(() => parseRuntimeHealth(value)).toThrow(/check_runtime/);
  });
});
