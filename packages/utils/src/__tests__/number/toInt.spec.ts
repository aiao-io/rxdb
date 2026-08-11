import { describe, expect, it } from 'vitest';
import { toInt } from '../../number/toInt.js';

describe('toInt', () => {
  describe('1', () => {
    it('string to number', () => {
      expect(toInt('1')).toEqual(1);
      expect(toInt('01')).toEqual(1);
      expect(toInt('001')).toEqual(1);
      expect(toInt('0001')).toEqual(1);
      expect(toInt('00001')).toEqual(1);
    });
    it('-string to number', () => {
      expect(toInt('-1')).toEqual(-1);
      expect(toInt('-01')).toEqual(-1);
      expect(toInt('-001')).toEqual(-1);
      expect(toInt('-0001')).toEqual(-1);
      expect(toInt('-00001')).toEqual(-1);
    });
    it('string to number', () => {
      expect(toInt('1')).toEqual(1);
      expect(toInt('0.1')).toEqual(0);
      expect(toInt('0.01')).toEqual(0);
      expect(toInt('0.001')).toEqual(0);
      expect(toInt('0.0001')).toEqual(0);
    });
  });
});
