import { describe, expect, it } from 'vitest';
import { OrbitError, OrbitProtocolError } from '../errors.js';
import {
  PROTOCOL,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  negotiateProtocol,
  parseProtocol,
  protocolId
} from '../protocol.js';

describe('协议版本规则', () => {
  it('当前版本与握手字符串保持不变：已发布的协议版本 1 应用必须继续可用', () => {
    expect(PROTOCOL_NAME).toBe('aiao.orbit');
    expect(PROTOCOL_VERSION).toBe(1);
    expect(PROTOCOL).toBe('aiao.orbit:1');
    expect(protocolId(PROTOCOL_VERSION)).toBe(PROTOCOL);
    expect(protocolId(12)).toBe('aiao.orbit:12');
  });

  it('握手里的协议字符串是 `aiao.orbit:<正整数>`，其余一律不认', () => {
    expect(parseProtocol('aiao.orbit:1')).toBe(1);
    expect(parseProtocol('aiao.orbit:2')).toBe(2);
    expect(parseProtocol('aiao.orbit:123456789')).toBe(123456789);
    for (const value of [
      'aiao.orbit:0',
      'aiao.orbit:01',
      'aiao.orbit:1.5',
      'aiao.orbit:-1',
      'aiao.orbit:',
      'aiao.orbit:1234567890',
      'aiao.orbit',
      'other:1',
      ' aiao.orbit:1',
      1,
      null,
      undefined,
      {}
    ])
      expect(parseProtocol(value)).toBeUndefined();
  });

  it('版本协商：同版本与更低版本照常运行，按应用声明的版本通信；更高版本不兼容', () => {
    expect(negotiateProtocol(1)).toEqual({ compatible: true, version: 1 });
    expect(negotiateProtocol(1, 3)).toEqual({ compatible: true, version: 1 });
    expect(negotiateProtocol(3, 3)).toEqual({ compatible: true, version: 3 });
    expect(negotiateProtocol(2)).toEqual({ compatible: false, requested: 2, supported: 1 });
    expect(negotiateProtocol(4, 3)).toEqual({ compatible: false, requested: 4, supported: 3 });
  });

  it('不兼容错误带稳定错误码，消息含双方版本，结构化字段供窗口显示', () => {
    const error = new OrbitProtocolError(2, 1);
    expect(error).toBeInstanceOf(OrbitError);
    expect(error).toMatchObject({
      code: 'INCOMPATIBLE_PROTOCOL',
      name: 'OrbitProtocolError',
      requested: 2,
      supported: 1
    });
    expect(error.message).toContain('aiao.orbit:2');
    expect(error.message).toContain('aiao.orbit:1');
  });
});
