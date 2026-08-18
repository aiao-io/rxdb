/**
 * 公开类型可具名消费（RRE-011）。
 *
 * @remarks
 * 只从包入口导入，避免测试通过内部路径绕过真实 consumer 契约。
 */
import { type RxDB } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  makeRxDBProvider,
  RxDBProvider,
  useRxDB,
  useRxDBOptional,
  type ProviderProps,
  type RxDBProviderSet,
  type RxDBProviderType,
  type RxDBResource,
  type RxDBSource,
  type UseOptions,
  type UseRxDB,
  type UseRxDBOptional
} from '../index.js';

interface QueryOptions {
  readonly limit: number;
}

describe('公开类型可具名消费（RRE-011）', () => {
  it('UseOptions 可标注常量、factory 与调用方包装函数', () => {
    const constant: UseOptions<QueryOptions> = { limit: 10 };
    const factory: UseOptions<QueryOptions> = () => ({ limit: 20 });
    const wrap = <T>(options: UseOptions<T>): UseOptions<T> => options;

    expect([constant, factory, wrap({ limit: 30 })]).toHaveLength(3);
  });

  it('Provider 的公开类型可标注默认导出与自定义 provider 对', () => {
    const provider: RxDBProviderType<RxDB> = RxDBProvider;
    const reader: UseRxDB<RxDB> = useRxDB;
    const optionalReader: UseRxDBOptional<RxDB> = useRxDBOptional;
    const factory: <T extends RxDB>() => RxDBProviderSet<T> = makeRxDBProvider;
    // `db` 是 RxDBSource<T> 而非 T：实例、Promise、工厂三种形态都收（三端同一契约）。
    const acceptProps = <T extends RxDB>(props: ProviderProps<T>): RxDBSource<T> => props.db;

    expect([provider, reader, optionalReader, factory, acceptProps].every(value => typeof value === 'function')).toBe(
      true
    );
  });

  it('RxDBResource 可作为调用方封装的具名返回类型', () => {
    const read = (resource: RxDBResource<string[]>): readonly [string[], boolean, boolean | undefined] => [
      resource.value,
      resource.hasValue,
      resource.isEmpty
    ];

    expect(read).toBeTypeOf('function');
  });
});
