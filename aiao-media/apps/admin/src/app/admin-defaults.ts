import type { PromptTemplate } from '@aiao-media/api-contracts';

export const defaultAdminTemplate: PromptTemplate = {
  id: 'fixture-template',
  title: '新模板',
  purpose: '创意设计',
  style: '简洁',
  tags: ['测试'],
  prompt: '描述你要创建的画面',
  image: '/prompt-art/coffee-launch.svg',
  alt: '模板预览',
  updatedAt: '2026-10-25',
  author: 'Aiao',
  source: 'Aiao 原创',
  rights: 'aiao-original-text-and-svg',
  referenceModel: null,
  needsReference: false,
  featuredRank: 1,
  fields: [],
  templateDocument: undefined
};
