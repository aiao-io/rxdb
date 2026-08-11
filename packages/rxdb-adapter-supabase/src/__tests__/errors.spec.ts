/**
 * @fileoverview Supabase 错误类单元测试
 *
 * 验证错误类的继承关系、name/code/message 属性。
 * 纯单元测试，不依赖 Supabase 连接。
 */

import { describe, expect, it } from 'vitest';
import { SupabaseConfigError, SupabaseDataError, SupabaseNetworkError, SupabaseSyncError } from '../errors.js';

describe('Supabase 错误类', () => {
  describe('SupabaseSyncError（基类）', () => {
    it('继承自 Error', () => {
      expect(new SupabaseSyncError('msg')).toBeInstanceOf(Error);
    });

    it('name 为 SupabaseSyncError', () => {
      expect(new SupabaseSyncError('msg').name).toBe('SupabaseSyncError');
    });

    it('message 正确传递', () => {
      expect(new SupabaseSyncError('hello world').message).toBe('hello world');
    });

    it('code 可选，传入时正确赋值', () => {
      expect(new SupabaseSyncError('msg', 'MY_CODE').code).toBe('MY_CODE');
    });

    it('code 不传时为 undefined', () => {
      expect(new SupabaseSyncError('msg').code).toBeUndefined();
    });
  });

  describe('SupabaseConfigError', () => {
    it('继承自 SupabaseSyncError', () => {
      expect(new SupabaseConfigError('msg')).toBeInstanceOf(SupabaseSyncError);
    });

    it('继承自 Error', () => {
      expect(new SupabaseConfigError('msg')).toBeInstanceOf(Error);
    });

    it('name 为 SupabaseConfigError', () => {
      expect(new SupabaseConfigError('msg').name).toBe('SupabaseConfigError');
    });

    it('code 固定为 CONFIG_ERROR', () => {
      expect(new SupabaseConfigError('msg').code).toBe('CONFIG_ERROR');
    });

    it('message 正确传递', () => {
      expect(new SupabaseConfigError('config failed').message).toBe('config failed');
    });
  });

  describe('SupabaseNetworkError', () => {
    it('继承自 SupabaseSyncError', () => {
      expect(new SupabaseNetworkError('msg')).toBeInstanceOf(SupabaseSyncError);
    });

    it('name 为 SupabaseNetworkError', () => {
      expect(new SupabaseNetworkError('msg').name).toBe('SupabaseNetworkError');
    });

    it('code 固定为 NETWORK_ERROR', () => {
      expect(new SupabaseNetworkError('msg').code).toBe('NETWORK_ERROR');
    });

    it('message 正确传递', () => {
      expect(new SupabaseNetworkError('timeout').message).toBe('timeout');
    });
  });

  describe('SupabaseDataError', () => {
    it('继承自 SupabaseSyncError', () => {
      expect(new SupabaseDataError('msg')).toBeInstanceOf(SupabaseSyncError);
    });

    it('name 为 SupabaseDataError', () => {
      expect(new SupabaseDataError('msg').name).toBe('SupabaseDataError');
    });

    it('code 固定为 DATA_ERROR', () => {
      expect(new SupabaseDataError('msg').code).toBe('DATA_ERROR');
    });

    it('message 正确传递', () => {
      expect(new SupabaseDataError('invalid json').message).toBe('invalid json');
    });
  });

  describe('instanceof 跨类检查', () => {
    it('SupabaseConfigError 不是 SupabaseDataError', () => {
      expect(new SupabaseConfigError('msg')).not.toBeInstanceOf(SupabaseDataError);
    });

    it('SupabaseNetworkError 不是 SupabaseConfigError', () => {
      expect(new SupabaseNetworkError('msg')).not.toBeInstanceOf(SupabaseConfigError);
    });

    it('SupabaseDataError 不是 SupabaseNetworkError', () => {
      expect(new SupabaseDataError('msg')).not.toBeInstanceOf(SupabaseNetworkError);
    });
  });
});
