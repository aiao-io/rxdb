import { describe, expect, it } from 'vitest';
import agGridPage from './AgGridPage.vue?raw';
import codeEditorPage from './CodeEditorPage.vue?raw';
import generatorPage from './GeneratorPage.vue?raw';

const pages = {
  AgGridPage: agGridPage,
  CodeEditorPage: codeEditorPage,
  GeneratorPage: generatorPage
};

describe('theme page contracts', () => {
  it.each(Object.entries(pages))('%s consumes the shared reactive theme state', (_name, source) => {
    expect(source).not.toContain('matchMedia(');
  });
});
