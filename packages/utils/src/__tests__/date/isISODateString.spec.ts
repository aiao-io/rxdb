import { describe, expect, it } from 'vitest';
import { isISODateString } from '../../date/isISODateString.js';

describe('isISODateString', () => {
  it.each(['2019-09-29T13:50:39.247Z', '2019-09-29T13:50:39+08:00', '2019-09-29T13:50:39+0800'])(
    'accepts valid ISO timestamps: %s',
    value => {
      expect(isISODateString(value)).toBe(true);
    }
  );

  it.each([
    '2019-09-29T13:50:39',
    'prefix2019-09-29T13:50:39Z',
    '2019-09-29T13:50:39Zsuffix',
    '2019-02-30T13:50:39Z',
    '2019-13-01T13:50:39Z',
    '2019-09-29T24:00:00Z',
    '2019-09-29T13:60:00Z'
  ])('rejects invalid or ambiguous timestamps: %s', value => {
    expect(isISODateString(value)).toBe(false);
  });
});
