import config from '../../app.config.json' with { type: 'json' };

/** 应用模板的品牌、持久化隔离与实体可见性配置。 */
export interface AppConfig {
  readonly title: string;
  readonly description: string;
  readonly brandTitle: string;
  readonly dbName: string;
  readonly storagePrefix: string;
  readonly visibleNamespaces: readonly string[];
}

/** 构建阶段与浏览器运行时共用的应用配置。 */
export const appConfig: AppConfig = config;
