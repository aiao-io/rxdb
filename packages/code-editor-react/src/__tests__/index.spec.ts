import { expect, expectTypeOf, it } from 'vitest';

import type { CodeEditorHandle, CodeEditorProps, CodeEditorSetup, CodeEditorTheme } from '../index';
import { CodeEditor } from '../index';

it('exports the component and stable public option types', () => {
  expect(CodeEditor).toBeTypeOf('function');
  expectTypeOf<CodeEditorSetup>().toEqualTypeOf<'basic' | 'minimal' | null>();
  expectTypeOf<CodeEditorTheme>().toEqualTypeOf<'light' | 'dark'>();
  expectTypeOf<CodeEditorProps['setup']>().toEqualTypeOf<CodeEditorSetup | undefined>();
  expectTypeOf<CodeEditorProps['theme']>().toEqualTypeOf<CodeEditorTheme | undefined>();
  expectTypeOf<CodeEditorProps['ref']>().toEqualTypeOf<import('react').Ref<CodeEditorHandle> | undefined>();
});
