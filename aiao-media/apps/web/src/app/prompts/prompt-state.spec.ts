import { describe, expect, it } from 'vitest';
import { catalogData } from './catalog-data';
import { applyIssue, filterCatalog, templateState, validateCatalog, type CatalogQuery } from './prompt-catalog';
import { plainPrompt, serializePrompt } from './prompt-state';
const query: CatalogQuery = {
  search: '',
  purpose: '',
  style: '',
  reference: 'all',
  sort: 'featured'
};
describe('public inert prompt library', () => {
  it('ships 12 unique original illustrative entries covering four purposes', () => {
    const catalog = validateCatalog(catalogData);
    expect(catalog).toHaveLength(12);
    expect(new Set(catalog.map(x => x.purpose)).size).toBe(4);
    expect(catalog.every(x => x.image.startsWith('/prompt-art/') && x.referenceModel === null)).toBe(true);
  });
  it('matches title, original body and tags without case sensitivity, intersects filters', () => {
    expect(filterCatalog(catalogData, { ...query, search: 'PERFUME' })).toHaveLength(1);
    expect(filterCatalog(catalogData, { ...query, search: '香水', purpose: '人像' })).toHaveLength(0);
    expect(
      filterCatalog(catalogData, {
        ...query,
        purpose: '产品营销',
        style: '极简',
        reference: 'yes'
      }).map(x => x.id)
    ).toEqual(['product-reference']);
  });
  it('sorts featured rank then stable ID and recent date then stable ID, without double-counting', () => {
    const catalog = structuredClone(catalogData);
    catalog[11].updatedAt = '2026-10-03';
    expect(filterCatalog(catalog, { ...query, sort: 'recent' })[0].id).toBe(catalog[11].id);
    expect(
      filterCatalog(catalog, query)
        .slice(0, 3)
        .map(x => x.featuredRank)
    ).toEqual([0, 1, 2]);
    expect(filterCatalog(catalog, { ...query, search: 'no-match-123' })).toEqual([]);
  });
  it('rejects duplicate IDs, remote images and malformed declared parameter documents', () => {
    expect(() => validateCatalog([...catalogData, catalogData[0]])).toThrow();
    expect(() => validateCatalog([{ ...catalogData[1], image: 'https://private.invalid/result' }])).toThrow();
    expect(() => validateCatalog([{ ...catalogData[1], rights: undefined }])).toThrow();
    expect(() => validateCatalog([{ ...catalogData[1], rights: 'unverified-remote' }])).toThrow();
    const bad = structuredClone(catalogData[0]);
    bad.templateDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'templateField', attrs: { fieldId: 'unknown' } }]
        }
      ]
    };
    expect(() => validateCatalog([bad])).toThrow();
  });
  it('round trips JSON, multiline, literal braces and HTML as text with UTF16 accounting', () => {
    const text = '{"a":"{{not-a-field}}"}\n<script>alert(1)</script>\n😀';
    const result = serializePrompt(plainPrompt(text));
    expect(result).toEqual({ text, valid: true, issues: [] });
    expect(result.text.length).toBe(text.length);
  });
  it('expands only declared nodes, requires fields and synchronizes repeated values', () => {
    const state = templateState(catalogData[0]);
    expect(serializePrompt(state).valid).toBe(false);
    state.values['brand'] = '<Aiao>{{inert}}';
    state.values['product'] = '陶器';
    const result = serializePrompt(state);
    expect(result.valid).toBe(true);
    expect(result.text.match(/陶器/g)).toHaveLength(2);
    expect(result.text).toContain('<Aiao>{{inert}}');
    expect(result.text).not.toContain('fieldId');
  });
  it('rejects unknown nodes, unknown field values and removed required nodes', () => {
    const state = templateState(catalogData[0]);
    state.values['brand'] = 'Aiao';
    state.document.content = [{ type: 'paragraph', content: [{ type: 'text', text: '正文仍在' }] }];
    expect(serializePrompt(state).issues.join(' ')).toContain('缺少');
    state.values['unknown'] = 'not-trusted';
    expect(serializePrompt(state).valid).toBe(false);
    expect(
      serializePrompt({
        ...plainPrompt('safe'),
        document: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'image' } as never] }]
        }
      }).valid
    ).toBe(false);
  });
  it('preserves 2001 characters rather than truncating, counts every repeated expansion', () => {
    expect(serializePrompt(plainPrompt('字'.repeat(2000))).valid).toBe(true);
    expect(serializePrompt(plainPrompt('字'.repeat(2001))).text).toHaveLength(2001);
    expect(serializePrompt(plainPrompt('字'.repeat(2001))).valid).toBe(false);
    const state = templateState(catalogData[0]);
    state.values['brand'] = 'Aiao';
    state.values['product'] = '字'.repeat(1100);
    expect(serializePrompt(state).text.length).toBeGreaterThan(2200);
    expect(serializePrompt(state).valid).toBe(false);
  });
  it('protects busy, reference-required and over-limit apply but allows copying full catalog text', () => {
    expect(applyIssue(catalogData[1], true)).toContain('正在生成');
    expect(applyIssue(catalogData[11], false)).toContain('参考图');
    expect(applyIssue({ ...catalogData[1], prompt: 'x'.repeat(2001) }, false)).toContain('2000');
    expect(applyIssue({ ...catalogData[1], prompt: 'x'.repeat(2000) }, false)).toBeNull();
    expect(applyIssue(catalogData[0], false)).toBeNull(); // Required parameters can be filled after applying.
  });
});
