import { adapterErrorText, describeError } from './describe-error.js';

describe('describeError', () => {
  it('普通对象：保留 errMsg、错误码与自有键', () => {
    const described = describeError({ errMsg: 'no such file or directory, accessSync x', errNo: 108802 });
    expect(described).toMatchObject({
      typeof: 'object',
      constructorName: 'Object',
      errMsg: 'no such file or directory, accessSync x',
      codes: { errNo: 108802 },
      ownKeys: ['errMsg', 'errNo']
    });
    expect(described.name).toBeUndefined();
  });

  it('支付宝 FS 返回的错误对象：error 记进错误码，errorMessage 单独保留', () => {
    const described = describeError({ error: 10022, message: '文件/目录不存在 x', errorMessage: '文件/目录不存在 x' });
    expect(described).toMatchObject({ codes: { error: 10022 }, errorMessage: '文件/目录不存在 x' });
    expect(describeError({ errorCode: '90000', errorMessage: '内部错误' })).toMatchObject({
      codes: { errorCode: '90000' },
      errorMessage: '内部错误'
    });
  });

  it('Error 实例：记 name、message 与 cause 链', () => {
    const error = new RangeError('外层', { cause: Object.assign(new Error('内层'), { code: 'E1' }) });
    const described = describeError(error);
    expect(described).toMatchObject({ constructorName: 'RangeError', name: 'RangeError', message: '外层' });
    expect(described.cause).toMatchObject({ message: '内层', codes: { code: 'E1' } });
  });

  it('cause 成环时最多展开 5 层', () => {
    const error = new Error('环') as Error & { cause?: unknown };
    error.cause = error;
    let depth = 0;
    for (let current = describeError(error).cause; current; current = current.cause) depth++;
    expect(depth).toBe(5);
  });

  it('原始值与 String() 会抛的值都能描述', () => {
    expect(describeError('boom')).toMatchObject({ typeof: 'string', text: 'boom', ownKeys: [] });
    const described = describeError(Object.create(null));
    expect(described.constructorName).toBeUndefined();
    expect(described.text).toMatch(/^String\(\) 抛出/);
  });
});

describe('adapterErrorText', () => {
  it('与 adapter 同序：errMsg → message → String()', () => {
    expect(adapterErrorText({ errMsg: 'a', message: 'b' })).toBe('a');
    expect(adapterErrorText(new Error('b'))).toBe('b');
    expect(adapterErrorText(42)).toBe('42');
  });
});
