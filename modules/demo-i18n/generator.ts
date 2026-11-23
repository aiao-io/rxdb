import type { MessageCatalog } from '@aiao/rxdb-i18n';

/** 代码生成器演示页的简体中文文案目录。 */
export const generatorZhMessages = {
  'page.generator.download': '生成并下载'
} as const;

/** 代码生成器演示页的文案键。 */
export type GeneratorMessageKey = keyof typeof generatorZhMessages;

/** 代码生成器演示页的英文文案目录；键集合必须与简体中文目录一致。 */
export const generatorEnMessages = {
  'page.generator.download': 'Generate and download'
} satisfies Record<GeneratorMessageKey, string>;

/** 代码生成器演示页的随包目录；三端演示共用同一份。 */
export const generatorCatalogs: readonly MessageCatalog[] = [
  { locale: 'zh-Hans', namespace: 'app', messages: generatorZhMessages },
  { locale: 'en', namespace: 'app', messages: generatorEnMessages }
];
