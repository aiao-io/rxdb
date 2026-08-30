import { describe, expect, it } from 'vitest';

import {
  DEVTOOLS_CAPABILITY_ENV,
  DEVTOOLS_ENABLE_ENV,
  DEVTOOLS_EXTENSION_PATH_ENV,
  DEVTOOLS_MUTATION_ENV,
  isDevToolsEnabled,
  loadDevToolsExtension,
  resolveDevToolsDevConfig,
  type DevToolsExtensionLoader
} from './devtools-extension';

const ABSOLUTE = (path: string): boolean => path.startsWith('/');

const enabledEnv = (overrides: Record<string, string> = {}): Record<string, string | undefined> => ({
  [DEVTOOLS_ENABLE_ENV]: '1',
  [DEVTOOLS_EXTENSION_PATH_ENV]: '/abs/ext',
  [DEVTOOLS_CAPABILITY_ENV]: 'readonly',
  ...overrides
});

function loaderWith(extensions: readonly { id: string; name: string }[]): DevToolsExtensionLoader {
  let loaded = [...extensions];
  return {
    getAllExtensions: () => loaded,
    loadExtension: async path => {
      const extension = { id: 'ext-1', name: path };
      loaded = [...loaded, extension];
      return extension;
    }
  };
}

describe('devtools-extension 开发态加载闸门（US-904 阶段 D AC#45）', () => {
  describe('isDevToolsEnabled', () => {
    it('只认逐字为 1 的开关', () => {
      expect(isDevToolsEnabled({ [DEVTOOLS_ENABLE_ENV]: '1' })).toBe(true);
      expect(isDevToolsEnabled({ [DEVTOOLS_ENABLE_ENV]: 'true' })).toBe(false);
      expect(isDevToolsEnabled({ [DEVTOOLS_ENABLE_ENV]: '0' })).toBe(false);
      expect(isDevToolsEnabled({})).toBe(false);
    });
  });

  describe('resolveDevToolsDevConfig', () => {
    it('未开启时返回 undefined，调用方据此完全跳过', () => {
      expect(resolveDevToolsDevConfig({}, ABSOLUTE)).toBeUndefined();
    });

    it('开启但缺任一配置时抛错，不猜默认值', () => {
      expect(() => resolveDevToolsDevConfig({ [DEVTOOLS_ENABLE_ENV]: '1' }, ABSOLUTE)).toThrow();
      expect(() =>
        resolveDevToolsDevConfig({ [DEVTOOLS_ENABLE_ENV]: '1', [DEVTOOLS_EXTENSION_PATH_ENV]: '/x' }, ABSOLUTE)
      ).toThrow();
    });

    it('扩展路径必须是绝对路径', () => {
      expect(() =>
        resolveDevToolsDevConfig(enabledEnv({ [DEVTOOLS_EXTENSION_PATH_ENV]: 'relative/ext' }), ABSOLUTE)
      ).toThrow();
    });

    it('能力档必须是 none / readonly / full 之一', () => {
      expect(() => resolveDevToolsDevConfig(enabledEnv({ [DEVTOOLS_CAPABILITY_ENV]: 'admin' }), ABSOLUTE)).toThrow();
    });

    it('写入开关只有逐字 allow 才开写，省略即只读', () => {
      expect(resolveDevToolsDevConfig(enabledEnv(), ABSOLUTE)?.mutationPolicy).toBe('omit');
      expect(resolveDevToolsDevConfig(enabledEnv({ [DEVTOOLS_MUTATION_ENV]: 'allow' }), ABSOLUTE)?.mutationPolicy).toBe(
        'allow'
      );
      expect(() => resolveDevToolsDevConfig(enabledEnv({ [DEVTOOLS_MUTATION_ENV]: 'yes' }), ABSOLUTE)).toThrow();
    });
  });

  describe('loadDevToolsExtension', () => {
    it('加载前已有扩展时拒绝再加载', async () => {
      const loader = loaderWith([{ id: 'other', name: 'other' }]);
      await expect(
        loadDevToolsExtension(loader, { extensionPath: '/x', capability: 'readonly', mutationPolicy: 'omit' })
      ).rejects.toThrow();
    });

    it('加载成功且恰好一个时返回扩展身份', async () => {
      const loader = loaderWith([]);
      const result = await loadDevToolsExtension(loader, {
        extensionPath: '/x',
        capability: 'readonly',
        mutationPolicy: 'omit'
      });
      expect(result).toEqual({ id: 'ext-1', name: '/x' });
    });

    it('加载后数量不为一时视为接线错误', async () => {
      // 一个 loadExtension 却登记出两个扩展 —— 重复加载在这里必须显式爆出来，而不是静默多一份 relay。
      const loader = loaderWith([]);
      loader.loadExtension = async path => {
        loader.getAllExtensions = () => [
          { id: 'a', name: 'a' },
          { id: 'b', name: 'b' }
        ];
        return { id: 'a', name: path };
      };
      await expect(
        loadDevToolsExtension(loader, { extensionPath: '/x', capability: 'readonly', mutationPolicy: 'omit' })
      ).rejects.toThrow();
    });
  });
});
