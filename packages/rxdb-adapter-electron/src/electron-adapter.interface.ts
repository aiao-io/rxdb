/**
 * 桌面适配器在本包内的身份。
 *
 * @remarks
 * 选项形状与逻辑文件名后缀已下沉到 `@aiao/rxdb-adapter-sqlite-core/desktop-host`
 * （两个桌面运行时共用同一份）；留在这里的只有**注册名**——它是每个运行时包各自的身份，
 * 共享层不替它们定名。
 *
 * @module desktop-adapter.interface
 */

/** 适配器在 `RxDBAdapters` 注册表中的名字。 */
export const ADAPTER_NAME = 'desktop' as const;
