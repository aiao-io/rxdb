import config from '../../app.config.json' with { type: 'json' };

/** 某种语言下的应用标识文案。 */
export interface AppLocaleConfig {
  readonly title: string;
  readonly description: string;
  readonly brandTitle: string;
}

/** 应用模板的品牌、持久化隔离与实体可见性配置。 */
export interface AppConfig {
  readonly title: string;
  readonly description: string;
  readonly brandTitle: string;
  readonly dbName: string;
  readonly storagePrefix: string;
  readonly visibleNamespaces: readonly string[];
  /** 应用标识的翻译；未配置时沿用原标识。 */
  readonly locales?: Readonly<Record<string, AppLocaleConfig>>;
}

/** 构建阶段与浏览器运行时共用的应用配置。 */
export const appConfig: AppConfig = config;
