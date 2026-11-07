// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGatewayConfig } from '../../src/config';

/**
 * `config.ts` 此前 **76.56% 语句 / 25 个未覆盖分支**——`loadGatewayConfig` 的每条
 * 校验失败路径、`${env:VAR}` 插值的每种取值、以及 CORS 三分支都没有用例
 * （specs/027 T148）。
 *
 * 它是启动期一次性代码：出错的表现是**进程起不来或起来了但配置是错的**，
 * 恰恰是最难靠集成测试兜住的一类。
 */

const TMP = mkdtempSync(join(tmpdir(), 'aiao-config-'));

/** 写一份临时 YAML，返回绝对路径 */
const writeYaml = (name: string, text: string): string => {
  const path = join(TMP, name);
  writeFileSync(path, text, 'utf-8');
  return path;
};

const ONE_PROVIDER = `
providers:
  - id: p1
    modality: chat
    modelIds: [m1, m2]
    baseUrl: https://example.test
    apiKey: sk-plain
    capabilities: [stream]
    isDefault: true
`;

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe('loadGatewayConfig — 正常解析', () => {
  it('解析出类型化的 provider 列表', () => {
    const path = writeYaml('ok.yaml', ONE_PROVIDER);

    expect(loadGatewayConfig(path)).toEqual({
      providers: [
        {
          id: 'p1',
          modality: 'chat',
          modelIds: ['m1', 'm2'],
          baseUrl: 'https://example.test',
          apiKey: 'sk-plain',
          capabilities: ['stream'],
          isDefault: true
        }
      ]
    });
  });

  it('缺省字段落到各自的零值，不抛错', () => {
    const path = writeYaml('minimal.yaml', 'providers:\n  - id: p1\n    modality: tts\n    modelIds: [m1]\n');

    expect(loadGatewayConfig(path).providers[0]).toMatchObject({
      baseUrl: '',
      apiKey: '',
      capabilities: [],
      isDefault: false
    });
  });

  it('modelIds / capabilities 的非数组值退化为 []（modelIds 因此触发必填校验）', () => {
    const badModelIds = writeYaml('nonarray.yaml', 'providers:\n  - id: p1\n    modality: chat\n    modelIds: nope\n');

    expect(() => loadGatewayConfig(badModelIds)).toThrow(/modelIds must be non-empty array/);

    const badCaps = writeYaml(
      'nonarray-caps.yaml',
      'providers:\n  - id: p1\n    modality: chat\n    modelIds: [m1]\n    capabilities: nope\n'
    );

    expect(loadGatewayConfig(badCaps).providers[0].capabilities).toEqual([]);
  });

  it('providers 为空数组时返回空列表', () => {
    expect(loadGatewayConfig(writeYaml('empty.yaml', 'providers: []\n'))).toEqual({ providers: [] });
  });
});

describe('loadGatewayConfig — ${env:VAR} 插值', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  const withApiKey = (raw: string) =>
    writeYaml(
      `interp-${Buffer.from(raw).toString('hex').slice(0, 12)}.yaml`,
      `providers:\n  - id: p1\n    modality: chat\n    modelIds: [m1]\n    apiKey: "${raw}"\n`
    );

  it('变量有值时取变量', () => {
    process.env.AIAO_TEST_KEY = 'sk-from-env';

    expect(loadGatewayConfig(withApiKey('${env:AIAO_TEST_KEY}')).providers[0].apiKey).toBe('sk-from-env');
  });

  it.each([
    ['未定义', undefined],
    ['空串', '']
  ])('变量%s时取 :- 默认值', (_label, value) => {
    if (value === undefined) delete process.env.AIAO_TEST_KEY;
    else process.env.AIAO_TEST_KEY = value;

    expect(loadGatewayConfig(withApiKey('${env:AIAO_TEST_KEY:-fallback}')).providers[0].apiKey).toBe('fallback');
  });

  it('变量无值且无默认值时插成空串（不保留占位符）', () => {
    delete process.env.AIAO_TEST_KEY;

    expect(loadGatewayConfig(withApiKey('${env:AIAO_TEST_KEY}')).providers[0].apiKey).toBe('');
  });

  it('插值递归进数组与嵌套对象，非字符串原样保留', () => {
    process.env.AIAO_TEST_MODEL = 'gpt-x';
    const path = writeYaml(
      'nested.yaml',
      `providers:
  - id: p1
    modality: chat
    modelIds: ["\${env:AIAO_TEST_MODEL}"]
    isDefault: true
    capabilities: ["stream"]
`
    );

    const provider = loadGatewayConfig(path).providers[0];

    expect(provider.modelIds).toEqual(['gpt-x']);
    expect(provider.isDefault).toBe(true);
  });
});

describe('loadGatewayConfig — 失败路径', () => {
  it('所有候选路径都读不到 → 报出尝试过的路径', () => {
    expect(() => loadGatewayConfig(join(TMP, 'nope.yaml'))).toThrow(/Failed to read gateway config; tried \[/);
  });

  it('不传路径时按默认候选查找，失败信息列出两条候选', () => {
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(join(TMP, 'no-such-root'));

    expect(() => loadGatewayConfig()).toThrow(/apps\/aiao-model-design\/server\/config\/providers\.yaml.*config\/providers\.yaml/s);

    spy.mockRestore();
  });

  it.each([
    ['根不是对象', 'just a string\n', /root must be an object/],
    ['根为空', '\n', /root must be an object/],
    ['providers 不是数组', 'providers: 1\n', /'providers' must be an array/],
    ['providers 缺失', 'other: 1\n', /'providers' must be an array/]
  ])('%s → 抛错', (_label, yaml, pattern) => {
    expect(() => loadGatewayConfig(writeYaml(`bad-${_label}.yaml`, yaml))).toThrow(pattern);
  });

  it.each([
    ['条目不是对象', 'providers:\n  - just-a-string\n', /providers\[0\] must be an object/],
    ['条目为 null', 'providers:\n  - null\n', /providers\[0\] must be an object/],
    ['id 缺失', 'providers:\n  - modality: chat\n', /providers\[0\]\.id missing/],
    ['id 为空白', 'providers:\n  - id: "   "\n', /providers\[0\]\.id missing/],
    ['modality 非法', 'providers:\n  - id: p1\n    modality: video\n', /providers\[0\]\.modality invalid \(video\)/],
    ['modality 缺失', 'providers:\n  - id: p1\n', /providers\[0\]\.modality invalid/]
  ])('%s → 抛错并带下标', (_label, yaml, pattern) => {
    expect(() => loadGatewayConfig(writeYaml(`bad-item-${_label}.yaml`, yaml))).toThrow(pattern);
  });

  it('错误下标指向真正出错的那一条，不是第一条', () => {
    const path = writeYaml(
      'second-bad.yaml',
      'providers:\n  - id: p1\n    modality: chat\n    modelIds: [m1]\n  - id: p2\n    modality: nope\n'
    );

    expect(() => loadGatewayConfig(path)).toThrow(/providers\[1\]\.modality invalid/);
  });
});

/**
 * `config` 是模块顶层求值的常量，改 env 之后必须 `resetModules` 重新 import
 * 才能观察到——直接改 `process.env` 再读旧引用是读不到的。
 */
describe('config — CORS 三分支', () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => vi.resetModules());
  afterEach(() => {
    process.env = { ...ORIGINAL };
    vi.resetModules();
  });

  const loadConfig = async () => (await import('../../src/config')).config;

  it('配了 CORS_ORIGIN → 按逗号切分并去空白', async () => {
    process.env.CORS_ORIGIN = ' https://a.test , https://b.test ';

    expect((await loadConfig()).CORS_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
  });

  it('未配 + 非生产 → true（放行全部）', async () => {
    delete process.env.CORS_ORIGIN;
    process.env.NODE_ENV = 'development';

    expect((await loadConfig()).CORS_ORIGINS).toBe(true);
  });

  it('未配 + 生产 → 空数组（fail-closed，不放行）', async () => {
    delete process.env.CORS_ORIGIN;
    process.env.NODE_ENV = 'production';

    expect((await loadConfig()).CORS_ORIGINS).toEqual([]);
  });

  it('PORT 未配时落到 3200', async () => {
    delete process.env.PORT;

    expect((await loadConfig()).PORT).toBe(3200);
  });

  /**
   * `NODE_ENV: env.NODE_ENV || 'development'` 的 fallback 分支**在 vitest 下不可达**：
   * runner 保证 `NODE_ENV=test` 存在，`delete` 之后下一次模块求值时它又被填回来。
   *
   * 不为覆盖率去 stub `node:process`——那样测的是替身的行为，不是这行代码的行为
   *（本 spec 记过太多次：替身比真实上游干净）。这条分支留白，比一条假绿诚实。
   */
});
