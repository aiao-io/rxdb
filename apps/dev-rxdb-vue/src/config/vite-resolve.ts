import { defaultClientConditions } from 'vite';

export const sourceConditions = ['@aiao/source', ...defaultClientConditions];

export const codemirrorPackages = [
  '@codemirror/commands',
  '@codemirror/language',
  '@codemirror/state',
  '@codemirror/theme-one-dark',
  '@codemirror/view',
  'codemirror'
];

export const appResolveConfig = {
  tsconfigPaths: true,
  conditions: sourceConditions,
  dedupe: codemirrorPackages
};
