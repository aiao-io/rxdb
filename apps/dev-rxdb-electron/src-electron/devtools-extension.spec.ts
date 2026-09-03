import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DEVTOOLS_CAPABILITY_ARG,
  DEVTOOLS_CAPABILITY_ENV,
  DEVTOOLS_MUTATION_ARG,
  DEVTOOLS_ENABLE_ENV,
  DEVTOOLS_EXTENSION_PATH_ENV,
  DEVTOOLS_MUTATION_ENV,
  devToolsLaunchArguments,
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

describe('devToolsLaunchArguments（US-904 阶段 D：把授权配置带进渲染进程）', () => {
  it('把档位与写入开关编码成两条启动参数', () => {
    expect(devToolsLaunchArguments({ extensionPath: '/abs/ext', capability: 'full', mutationPolicy: 'allow' })).toEqual([
      '--rxdb-devtools-capability=full',
      '--rxdb-devtools-mutation=allow'
    ]);
  });

  it('省略写入开关时如实带出 omit，而不是省掉这条参数', () => {
    // preload 侧「两条同时在且合法才挂」是有意的：半份配置比没有配置更难排查。
    // 少带一条会让 preload 整体不挂，档位随之失效——那才是静默降级。
    expect(
      devToolsLaunchArguments({ extensionPath: '/abs/ext', capability: 'readonly', mutationPolicy: 'omit' })
    ).toEqual(['--rxdb-devtools-capability=readonly', '--rxdb-devtools-mutation=omit']);
  });

  it('没开开发态 DevTools 时一条参数都不带', () => {
    // production 的渲染进程里不该出现任何调试配置的痕迹。
    expect(devToolsLaunchArguments(undefined)).toEqual([]);
  });
});

describe('三处字面量必须逐字一致', () => {
  // preload 在 `sandbox: true` 下是未 bundle 的逐文件 tsc 产物，不能值导入同目录文件；
  // 渲染进程又与主进程分属两个 tsconfig。于是同一组字面量落在三个文件里，只能靠这条用例钉住。
  // 任何一处漂移的表征都是「配置静默不生效」——connector 悄悄退回库默认档，没有任何报错。
  const read = (path: string): string => readFileSync(join(__dirname, path), 'utf8');

  it('挂载键在 ipc-contract / preload / 渲染进程三处一致', () => {
    const key = "'__aiaoRxdbDevToolsConfig__'";
    expect(read('ipc-contract.ts')).toContain(`DEVTOOLS_RUNTIME_CONFIG_KEY = ${key}`);
    expect(read('preload.ts')).toContain(`DEVTOOLS_RUNTIME_CONFIG_KEY = ${key}`);
    expect(read('../src/app/setup_rxdb_desktop.ts')).toContain(`DEVTOOLS_RUNTIME_CONFIG_KEY = ${key}`);
  });

  it('两条启动参数前缀在 devtools-extension / preload 两处一致', () => {
    const preload = read('preload.ts');
    expect(preload).toContain(`DEVTOOLS_CAPABILITY_ARG = '${DEVTOOLS_CAPABILITY_ARG}'`);
    expect(preload).toContain(`DEVTOOLS_MUTATION_ARG = '${DEVTOOLS_MUTATION_ARG}'`);
  });
});
