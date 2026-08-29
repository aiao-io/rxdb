import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { DevToolsValueComponent, toDevToolsDisplayRows } from './devtools-value.component';

describe('DevToolsValueComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('MUST distinguish bigint, number, binary, and ordinary object values', () => {
    const value = {
      count: { $rxdb: 1, type: 'bigint', value: '1' },
      rank: 1,
      payload: { $rxdb: 1, type: 'binary', encoding: 'base64url', value: 'AP8', byteLength: 2 },
      metadata: { value: 1 }
    };

    expect(toDevToolsDisplayRows(value).map(row => row.kind)).toEqual([
      'object',
      'bigint',
      'number',
      'binary',
      'object',
      'number'
    ]);

    const fixture = TestBed.createComponent(DevToolsValueComponent);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const kinds = Array.from(root.querySelectorAll<HTMLElement>('[data-value-kind]'), element =>
      element.getAttribute('data-value-kind')
    );
    expect(kinds).toEqual(['object', 'bigint', 'number', 'binary', 'object', 'number']);
  });

  it('MUST render unknown DevTools envelope versions as unsupported without decoding their value', () => {
    const rows = toDevToolsDisplayRows({
      payload: { $rxdb: 2, type: 'binary', value: 'do-not-decode', byteLength: 99 }
    });

    expect(rows).toEqual([
      expect.objectContaining({ kind: 'object' }),
      expect.objectContaining({
        key: 'payload',
        kind: 'unsupported',
        value: 'DevTools wire version 2'
      })
    ]);
    expect(rows.some(row => row.value.includes('do-not-decode') || row.value.includes('99'))).toBe(false);
  });
});
