import { unionBy } from '../../array/unionBy.js';
describe('unionBy', () => {
  it('should true', () => {
    expect(unionBy([1, 2, 3], item => item)).toEqual([1, 2, 3]);
  });

  it('should true', () => {
    expect(unionBy([2.1, 2.2, 2.3], Math.floor)).toEqual([2.1]);
  });
});
