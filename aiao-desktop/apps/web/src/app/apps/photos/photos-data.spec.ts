import { describe, expect, it } from 'vitest';

import { PHOTO_SEED_DATA, ZOOM_STEPS, longDate, photoDate, thumbAt, zoomStep } from './photos-data';

describe('thumbAt', () => {
  const thumb = 'https://example.test/thumb/a/b/File.jpg/500px-File.jpg';

  it('向上取最近的宽度档', () => {
    expect(thumbAt(thumb, 250)).toContain('/250px-');
    expect(thumbAt(thumb, 500)).toContain('/500px-');
    expect(thumbAt(thumb, 300)).toContain('/500px-');
    expect(thumbAt(thumb, 800)).toContain('/1280px-');
    expect(thumbAt(thumb, 4000)).toContain('/1280px-');
  });
});

describe('photoDate / longDate', () => {
  it('日期按本地正午解析，不因时区推前一天', () => {
    const date = photoDate('2026-05-11');
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 4, 11]);
    expect(longDate('2026-05-11')).toBe('Monday, 11 May 2026');
  });
});

describe('zoomStep', () => {
  it('在 1 / 2 / 4 三档之间移动，到头不再变', () => {
    expect(ZOOM_STEPS).toEqual([1, 2, 4]);
    expect(zoomStep(1, 1)).toBe(2);
    expect(zoomStep(2, 1)).toBe(4);
    expect(zoomStep(4, 1)).toBe(4);
    expect(zoomStep(4, -1)).toBe(2);
    expect(zoomStep(2, -1)).toBe(1);
    expect(zoomStep(1, -1)).toBe(1);
  });
});

describe('PHOTO_SEED_DATA', () => {
  it('初始照片的缩略图与日期字段完整', () => {
    expect(PHOTO_SEED_DATA.length).toBeGreaterThan(0);
    for (const photo of PHOTO_SEED_DATA) {
      expect(photo.thumb).toMatch(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\//);
      expect(photo.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
