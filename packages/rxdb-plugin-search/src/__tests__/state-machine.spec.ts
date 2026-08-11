import { describe, expect, it } from 'vitest';

import { createSearchState } from '../core/search-state.js';
import type { SearchResult } from '../types.js';
import { SearchExecutionError } from '../types.js';

const result: SearchResult = {
  entity: 'Article',
  collection: 'article',
  id: 'a1',
  rank: -1.0,
  matchedField: 'title',
  snippet: 'hello world'
};

describe('createSearchState', () => {
  it('starts in idle with no results / no error', () => {
    const sm = createSearchState();
    expect(sm.snapshot().state).toBe('idle');
    expect(sm.snapshot().results).toEqual([]);
    expect(sm.snapshot().error).toBeUndefined();
    expect(sm.snapshot().hasMore).toBe(false);
  });

  it('idle → loading on beginQuery(non-empty)', () => {
    const sm = createSearchState();
    sm.beginQuery('hello');
    expect(sm.snapshot().state).toBe('loading');
  });

  it('loading → success when resolveResults() returns non-empty', () => {
    const sm = createSearchState();
    sm.beginQuery('hello');
    sm.resolveResults([result], false);
    expect(sm.snapshot().state).toBe('success');
    expect(sm.snapshot().results).toEqual([result]);
    expect(sm.snapshot().hasMore).toBe(false);
  });

  it('loading → empty when resolveResults() returns []', () => {
    const sm = createSearchState();
    sm.beginQuery('xxx');
    sm.resolveResults([], false);
    expect(sm.snapshot().state).toBe('empty');
    expect(sm.snapshot().results).toEqual([]);
  });

  it('loading → error on rejectQuery()', () => {
    const sm = createSearchState();
    const err = new SearchExecutionError('boom');
    sm.beginQuery('hello');
    sm.rejectQuery(err);
    expect(sm.snapshot().state).toBe('error');
    expect(sm.snapshot().error).toBe(err);
  });

  it('error → loading on retry()', () => {
    const sm = createSearchState();
    sm.beginQuery('hello');
    sm.rejectQuery(new SearchExecutionError('boom'));
    sm.retry();
    expect(sm.snapshot().state).toBe('loading');
    expect(sm.snapshot().error).toBeUndefined();
  });

  it('clear() returns to idle from any state and clears everything', () => {
    const sm = createSearchState();
    sm.beginQuery('hello');
    sm.resolveResults([result], true);
    sm.clear();
    const snap = sm.snapshot();
    expect(snap.state).toBe('idle');
    expect(snap.results).toEqual([]);
    expect(snap.error).toBeUndefined();
    expect(snap.hasMore).toBe(false);
  });

  // --- 空查询短路（FR-014、FR-018，规格边界场景）---------------------------

  it('idle → idle when beginQuery("") (no transition to loading)', () => {
    const sm = createSearchState();
    sm.beginQuery('');
    expect(sm.snapshot().state).toBe('idle');
  });

  it('success → idle when beginQuery("") (no loading, no empty)', () => {
    const sm = createSearchState();
    sm.beginQuery('hello');
    sm.resolveResults([result], false);
    expect(sm.snapshot().state).toBe('success');
    sm.beginQuery('');
    expect(sm.snapshot().state).toBe('idle');
    expect(sm.snapshot().results).toEqual([]);
  });

  it('empty → idle when beginQuery("   ") (whitespace, no loading)', () => {
    const sm = createSearchState();
    sm.beginQuery('xxx');
    sm.resolveResults([], false);
    expect(sm.snapshot().state).toBe('empty');
    sm.beginQuery('   ');
    expect(sm.snapshot().state).toBe('idle');
  });

  it('error → idle when beginQuery(empty after trim)', () => {
    const sm = createSearchState();
    sm.beginQuery('hello');
    sm.rejectQuery(new SearchExecutionError('boom'));
    sm.beginQuery('  \t  ');
    expect(sm.snapshot().state).toBe('idle');
    expect(sm.snapshot().error).toBeUndefined();
  });

  it('state$ emits the current state on subscribe (BehaviorSubject)', async () => {
    const sm = createSearchState();
    sm.beginQuery('hello');
    let emitted: string | undefined;
    const sub = sm.state$.subscribe(s => {
      emitted = s;
    });
    sub.unsubscribe();
    expect(emitted).toBe('loading');
  });
});
