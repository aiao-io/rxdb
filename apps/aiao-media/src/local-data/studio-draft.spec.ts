import { describe, expect, it, vi } from 'vitest';
import { ownedStudioPrompt, readStudioPayload, studioPayload } from './studio-draft';
const plain = (text: string) => ({
  document: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
  },
  fields: [],
  values: {}
});
describe('owned inert studio draft codec, separate from generation validity', () => {
  it('preserves UTF-8, newline/JSON text and invalid-for-generation length without truncation', () => {
    const state = plain('中文\n{"key":"value"}\n' + 'x'.repeat(2000));
    expect(readStudioPayload(studioPayload(state), 3)).toEqual({
      revision: 3,
      state
    });
  });
  it('preserves declared template definitions, values and incomplete required fields', () => {
    const state = {
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'templateField',
                attrs: { fieldId: 'subject', value: '' }
              }
            ]
          }
        ]
      },
      fields: [
        {
          id: 'subject',
          label: '主体',
          defaultValue: 'default',
          required: true
        }
      ],
      values: { subject: '' }
    };
    expect(ownedStudioPrompt(state)).toEqual(state);
  });
  it('takes an owned copy; caller changes cannot mutate persisted state', () => {
    const original = plain('one'),
      copy = ownedStudioPrompt(original);
    original.document.content[0].content[0].text = 'changed';
    expect(copy.document.content?.[0].content?.[0].text).toBe('one');
  });
  it.each([
    {},
    null,
    [],
    { ...plain('x'), actorId: 'fake' },
    { ...plain('x'), values: { unknown: 'value' } },
    { ...plain('x'), document: { type: 'script', content: [] } }
  ])('rejects invalid or extra data %j', value => expect(() => ownedStudioPrompt(value)).toThrow());
  it('does not execute getters', () => {
    const state = plain('safe'),
      get = vi.fn();
    Object.defineProperty(state, 'document', { get });
    expect(() => ownedStudioPrompt(state)).toThrow();
    expect(get).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, '1', null])('rejects invalid revision %j', revision =>
    expect(() => readStudioPayload(studioPayload(plain('x')), revision)).toThrow()
  );
  it('rejects unknown versions, corruption and excessive drafts rather than overwriting or truncating', () => {
    expect(() => readStudioPayload('{invalid', 1)).toThrow();
    expect(() => readStudioPayload(JSON.stringify({ version: 2, state: plain('x') }), 1)).toThrow();
    expect(() => studioPayload(plain('x'.repeat(100001)))).toThrow();
  });
});
