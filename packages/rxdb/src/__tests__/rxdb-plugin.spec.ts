import { emptyFunction, LifecycleScope } from '@aiao/utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { RxDB } from '../RxDB.js';
import { EntityBase } from '../entity/entity-base.js';
import { Entity } from '../entity/entity.decorator.js';
import { EntityType } from '../entity/entity.interface.js';
import { PropertyType, SyncType } from '../entity/metadata-options.interface.js';
import { IRepository } from '../repository/repository.interface.js';
import { IRxDBAdapter } from '../rxdb-adapter.js';
import { IRxDBPlugin, Plugin, RxDBPluginBase } from '../rxdb-plugin.js';

/**
 * 本文件的用例只验证接口形状，不经宿主安装，`install()` 的形参给一个空作用域即可。
 * 每次新建而不是共用一个：作用域是**单向状态机**，共用会让先跑的用例影响后跑的用例。
 */
const anyScope = (): LifecycleScope => new LifecycleScope('rxdb-plugin-spec');

const createRepository = <T extends EntityType>(): IRepository<T> => ({
  find: async () => [],
  count: async () => 0,
  create: async entity => entity,
  update: async entity => entity,
  remove: async entity => entity
});

const createAdapter = (): IRxDBAdapter => {
  const adapter: IRxDBAdapter = {
    name: 'sqlite',
    connect: async () => adapter,
    disconnect: async () => undefined,
    version: async () => '1.0.0',
    getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>() {
      return createRepository<T>() as RT;
    },
    saveMany: async entities => entities,
    removeMany: async entities => entities,
    mutations: async () => [],
    isTableExisted: async () => true
  };
  return adapter;
};

describe('rxdb-plugin', () => {
  @Entity({
    name: 'TestEntity',
    properties: [{ name: 'title', type: PropertyType.string }]
  })
  class TestEntity extends EntityBase {
    title!: string;
  }

  let rxdb: RxDB;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'rxdb-plugin-test',
      entities: [TestEntity],
      sync: {
        local: {
          adapter: 'sqlite'
        },
        type: SyncType.None
      }
    });
    rxdb.adapter('sqlite', () => createAdapter());
    rxdb.init();
  });

  describe('IRxDBPlugin', () => {
    it('应实现插件接口', async () => {
      const plugin: IRxDBPlugin = {
        name: 'testPlugin',
        install: async () => {
          emptyFunction();
        },
        destroy: async () => {
          emptyFunction();
        }
      };

      expect(plugin.name).toBe('testPlugin');
      expect(typeof plugin.install).toBe('function');
      expect(typeof plugin.destroy).toBe('function');
    });

    it('应调用 install 方法', async () => {
      const installMock = vi.fn().mockResolvedValue(undefined);
      const plugin: IRxDBPlugin = {
        name: 'testPlugin',
        install: installMock,
        destroy: async () => {
          emptyFunction();
        }
      };

      await plugin.install(anyScope());
      expect(installMock).toHaveBeenCalledTimes(1);
    });

    it('应调用 destroy 方法', async () => {
      const destroyMock = vi.fn().mockResolvedValue(undefined);
      const plugin: IRxDBPlugin = {
        name: 'testPlugin',
        install: async () => {
          emptyFunction();
        },
        destroy: destroyMock
      };

      await plugin.destroy?.();
      expect(destroyMock).toHaveBeenCalledTimes(1);
    });

    it('名称首字母应为小写', () => {
      const plugin: IRxDBPlugin = {
        name: 'myPlugin',
        install: async () => {
          emptyFunction();
        },
        destroy: async () => {
          emptyFunction();
        }
      };

      expect(plugin.name[0]).toBe(plugin.name[0].toLowerCase());
    });
  });

  describe('RxDBPluginBase 基类', () => {
    it('应使用 rxdb 实例创建插件基类', () => {
      class TestPlugin extends RxDBPluginBase {
        getRxDB() {
          return this.rxdb;
        }
      }

      const plugin = new TestPlugin(rxdb);
      expect(plugin).toBeInstanceOf(RxDBPluginBase);
      expect(plugin.getRxDB()).toBe(rxdb);
    });

    it('应能在基类中访问 rxdb', async () => {
      class TestPlugin extends RxDBPluginBase implements IRxDBPlugin {
        name = 'testPlugin' as const;

        async install() {
          expect(this.rxdb).toBeDefined();
        }

        async destroy() {
          emptyFunction();
        }
      }

      const plugin = new TestPlugin(rxdb);
      await expect(plugin.install()).resolves.toBeUndefined();
    });

    it('应能在基类上扩展自定义方法', () => {
      class TestPlugin extends RxDBPluginBase {
        customMethod() {
          return 'custom';
        }
      }

      const plugin = new TestPlugin(rxdb);
      expect(plugin.customMethod()).toBe('custom');
    });

    it('应保护 rxdb 实例', () => {
      class TestPlugin extends RxDBPluginBase {
        tryModifyRxDB() {
          // rxdb 是只读的，本测试验证类型系统。
          return this.rxdb;
        }
      }

      const plugin = new TestPlugin(rxdb);
      expect(plugin.tryModifyRxDB()).toBe(rxdb);
    });
  });

  describe('插件工厂', () => {
    it('应通过工厂函数创建插件', () => {
      const pluginFactory: Plugin = () => ({
        name: 'factoryPlugin',
        install: async () => {
          emptyFunction();
        },
        destroy: async () => {
          emptyFunction();
        }
      });

      const plugin = pluginFactory(rxdb);
      expect(plugin).toBeDefined();
      expect(plugin.name).toBe('factoryPlugin');
    });

    it('应支持带参数创建插件', async () => {
      interface PluginOptions {
        enabled: boolean;
        timeout: number;
      }

      const pluginFactory: Plugin<PluginOptions> = (rxdb: RxDB, options?: PluginOptions) => ({
        name: 'optionsPlugin',
        install: async () => {
          expect(options?.enabled).toBe(true);
          expect(options?.timeout).toBe(5000);
        },
        destroy: async () => {
          emptyFunction();
        }
      });

      const plugin = pluginFactory(rxdb, { enabled: true, timeout: 5000 });
      await expect(plugin.install(anyScope())).resolves.toBeUndefined();
    });

    it('应支持不带参数创建插件', async () => {
      const pluginFactory: Plugin<{ optional?: string }> = (rxdb: RxDB, options?) => ({
        name: 'noOptionsPlugin',
        install: async () => {
          expect(options).toBeUndefined();
        },
        destroy: async () => {
          emptyFunction();
        }
      });

      const plugin = pluginFactory(rxdb);
      await expect(plugin.install(anyScope())).resolves.toBeUndefined();
    });

    it('应处理带默认参数的插件工厂', async () => {
      interface PluginOptions {
        prefix: string;
      }

      const pluginFactory: Plugin<PluginOptions> = (rxdb: RxDB, options = { prefix: 'default' }) => ({
        name: 'defaultOptionsPlugin',
        install: async () => {
          expect(options.prefix).toBe('default');
        },
        destroy: async () => {
          emptyFunction();
        }
      });

      const plugin = pluginFactory(rxdb);
      await expect(plugin.install(anyScope())).resolves.toBeUndefined();
    });
  });

  describe('插件生命周期', () => {
    it('应正确处理 install/destroy 生命周期', async () => {
      const lifecycle: string[] = [];

      const plugin: IRxDBPlugin = {
        name: 'lifecyclePlugin',
        install: async () => {
          lifecycle.push('install');
        },
        destroy: async () => {
          lifecycle.push('destroy');
        }
      };

      await plugin.install(anyScope());
      expect(lifecycle).toEqual(['install']);

      await plugin.destroy?.();
      expect(lifecycle).toEqual(['install', 'destroy']);
    });

    it('应处理 install 错误', async () => {
      const plugin: IRxDBPlugin = {
        name: 'errorPlugin',
        install: async () => {
          throw new Error('Install failed');
        },
        destroy: async () => {
          emptyFunction();
        }
      };

      await expect(plugin.install(anyScope())).rejects.toThrow('Install failed');
    });

    it('应处理 destroy 错误', async () => {
      const plugin: IRxDBPlugin = {
        name: 'errorPlugin',
        install: async () => {
          emptyFunction();
        },
        destroy: async () => {
          throw new Error('Destroy failed');
        }
      };

      await expect(plugin.destroy?.()).rejects.toThrow('Destroy failed');
    });

    it('应在生命周期中支持异步操作', async () => {
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      const plugin: IRxDBPlugin = {
        name: 'asyncPlugin',
        install: async () => {
          await delay(12);
        },
        destroy: async () => {
          await delay(12);
        }
      };

      const installStart = Date.now();
      await plugin.install(anyScope());
      const installDuration = Date.now() - installStart;
      expect(installDuration).toBeGreaterThanOrEqual(10);

      const destroyStart = Date.now();
      await plugin.destroy?.();
      const destroyDuration = Date.now() - destroyStart;
      expect(destroyDuration).toBeGreaterThanOrEqual(10);
    });
  });

  describe('完整插件示例', () => {
    it('应使用基类创建完整插件', async () => {
      interface LoggerOptions {
        level: 'info' | 'debug' | 'error';
      }

      class LoggerPlugin extends RxDBPluginBase implements IRxDBPlugin {
        private logs: string[] = [];
        name = 'logger' as const;

        constructor(
          rxdb: RxDB,
          private options: LoggerOptions
        ) {
          super(rxdb);
        }

        async install() {
          this.log('Logger plugin installed');
        }

        async destroy() {
          this.log('Logger plugin destroyed');
        }

        getLogs() {
          return this.logs;
        }

        private log(message: string) {
          this.logs.push(`[${this.options.level}] ${message}`);
        }
      }

      const plugin = new LoggerPlugin(rxdb, { level: 'info' });
      await plugin.install();
      expect(plugin.getLogs()).toContain('[info] Logger plugin installed');

      await plugin.destroy();
      expect(plugin.getLogs()).toContain('[info] Logger plugin destroyed');
    });

    it('应创建带内部状态的插件工厂', async () => {
      const createCachePlugin: Plugin<{ maxSize: number }> = (rxdb, options = { maxSize: 100 }) => {
        const cache = new Map<string, unknown>();

        return {
          name: 'cache',
          install: async () => {
            cache.set(rxdb.config.dbName, options.maxSize);
          },
          destroy: async () => {
            cache.clear();
          }
        };
      };

      const plugin = createCachePlugin(rxdb, { maxSize: 50 });
      expect(plugin.name).toBe('cache');
      await expect(plugin.install(anyScope())).resolves.toBeUndefined();
      await expect(plugin.destroy?.()).resolves.toBeUndefined();
    });
  });

  describe('多个插件', () => {
    it('应支持多个不同名称的插件', () => {
      const plugin1: IRxDBPlugin = {
        name: 'plugin1',
        install: async () => {
          emptyFunction();
        },
        destroy: async () => {
          emptyFunction();
        }
      };

      const plugin2: IRxDBPlugin = {
        name: 'plugin2',
        install: async () => {
          emptyFunction();
        },
        destroy: async () => {
          emptyFunction();
        }
      };

      expect(plugin1.name).not.toBe(plugin2.name);
    });

    it('应按顺序安装多个插件', async () => {
      const order: number[] = [];

      const plugin1: IRxDBPlugin = {
        name: 'first',
        install: async () => {
          order.push(1);
        },
        destroy: async () => {
          emptyFunction();
        }
      };

      const plugin2: IRxDBPlugin = {
        name: 'second',
        install: async () => {
          order.push(2);
        },
        destroy: async () => {
          emptyFunction();
        }
      };

      await plugin1.install(anyScope());
      await plugin2.install(anyScope());
      expect(order).toEqual([1, 2]);
    });

    it('应按相反顺序销毁多个插件', async () => {
      const order: number[] = [];

      const plugin1: IRxDBPlugin = {
        name: 'first',
        install: async () => {
          emptyFunction();
        },
        destroy: async () => {
          order.push(1);
        }
      };

      const plugin2: IRxDBPlugin = {
        name: 'second',
        install: async () => {
          emptyFunction();
        },
        destroy: async () => {
          order.push(2);
        }
      };

      await plugin2.destroy?.();
      await plugin1.destroy?.();
      expect(order).toEqual([2, 1]);
    });
  });
});
