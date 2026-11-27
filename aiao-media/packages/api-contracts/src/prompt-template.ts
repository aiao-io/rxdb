import type { PromptField, PromptNode } from './prompt-state.ts';

export type PromptTemplate = {
  id: string;
  title: string;
  purpose: string;
  style: string;
  tags: string[];
  prompt: string;
  image: string;
  alt: string;
  updatedAt: string;
  author: string;
  source: string;
  rights: 'aiao-original-text-and-svg' | 'community-reference';
  referenceModel: string | null;
  needsReference: boolean;
  featuredRank: number | null;
  templateDocument?: PromptNode;
  fields?: PromptField[];
};
