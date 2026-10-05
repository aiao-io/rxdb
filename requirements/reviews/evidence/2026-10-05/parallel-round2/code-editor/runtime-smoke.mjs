import {
  buildCodeEditorContentAttributes,
  codeEditorLanguageLoadFailed,
  codeEditorLanguageNotFound,
  computeMinimalDocumentChange,
  findLanguageByName,
  isSameResolvedLanguage,
  resolveCodeEditorLanguage,
  shouldAutoFocusCodeEditor,
  SQL,
  SUPPORT_LANGUAGES
} from '@aiao/code-editor';
import assert from 'node:assert/strict';

assert.equal(typeof globalThis.document, 'undefined');
assert.equal(typeof globalThis.window, 'undefined');
assert.equal(computeMinimalDocumentChange('same', 'same'), null);
assert.equal(computeMinimalDocumentChange('', ''), null);
for (const [current, next] of [
  ['', '中😀'],
  ['a😀z', 'a😀!z'],
  ['中\r\n文', '中\r\n'],
  ['e\u0301', 'e'],
  ['aaa', 'aa']
]) {
  const change = computeMinimalDocumentChange(current, next);
  assert.notEqual(change, null);
  assert.ok(change.from >= 0 && change.from <= change.to && change.to <= current.length);
  assert.equal(current.slice(0, change.from) + change.insert + current.slice(change.to), next);
}
assert.deepEqual(
  buildCodeEditorContentAttributes({ disabled: true, label: '代码输入', labelledBy: 'label', describedBy: 'hint' }),
  {
    'aria-disabled': 'true',
    'aria-label': '代码输入',
    'aria-labelledby': 'label',
    'aria-describedby': 'hint'
  }
);
assert.deepEqual(buildCodeEditorContentAttributes({ disabled: false, label: '', labelledBy: '', describedBy: '' }), {});
assert.notEqual(buildCodeEditorContentAttributes({}), buildCodeEditorContentAttributes({}));
assert.equal(shouldAutoFocusCodeEditor({}), true);
assert.equal(shouldAutoFocusCodeEditor({ readonly: true }), false);
assert.equal(shouldAutoFocusCodeEditor({ disabled: true }), false);
assert.ok(Object.isFrozen(SUPPORT_LANGUAGES));
assert.equal(findLanguageByName('sQl'), SQL);
assert.equal(findLanguageByName('unknown-review-language'), null);
assert.deepEqual(resolveCodeEditorLanguage('plaintext', SUPPORT_LANGUAGES), { kind: 'none' });
assert.deepEqual(resolveCodeEditorLanguage('SQL', []), { kind: 'none' });
assert.deepEqual(resolveCodeEditorLanguage('Unknown', SUPPORT_LANGUAGES), { kind: 'not-found', name: 'Unknown' });
const first = resolveCodeEditorLanguage('SQL', SUPPORT_LANGUAGES);
const second = resolveCodeEditorLanguage('sql', [...SUPPORT_LANGUAGES]);
assert.equal(first.kind, 'found');
assert.equal(first.description, SQL);
assert.equal(isSameResolvedLanguage(first, second), true);
assert.equal(isSameResolvedLanguage(undefined, first), false);
const notFound = codeEditorLanguageNotFound('Unknown');
assert.deepEqual(notFound, {
  kind: 'not-found',
  language: 'Unknown',
  message: "Language 'Unknown' not found.",
  cause: undefined
});
assert.ok(Object.isFrozen(notFound));
const cause = { status: 503 };
const failed = codeEditorLanguageLoadFailed('SQL', cause);
assert.equal(failed.kind, 'load-failed');
assert.equal(failed.cause, cause);
assert.ok(Object.isFrozen(failed));
const support = await SQL.load();
const tree = support.language.parser.parse('SELECT * FROM users;').toString();
assert.ok(tree.includes('Statement'));
assert.ok(!tree.includes('⚠'));
assert.equal(await SQL.load(), support);
console.log(
  JSON.stringify(
    {
      probe: 'R2-01-runtime-smoke',
      passed: true,
      rootResolved: import.meta.resolve('@aiao/code-editor'),
      node: process.version,
      domRequired: false,
      sqlTree: tree,
      browserBehaviorValidated: false
    },
    null,
    2
  )
);
