import { describe, expect, it } from 'vitest';
import { dateStringToDate } from '../../date/dateStringToDate.js';

describe('dateStringToDate', () => {
  it('1', () => {
    const date = dateStringToDate('2018-12-04', '19:09:10', 480);
    expect(date.toISOString()).toEqual('2018-12-04T11:09:10.000Z');
  });
});
