import { describe, expect, it } from 'vitest';

import { SEED_CONTACTS, emailOf } from './contacts-data';

describe('emailOf', () => {
  it('取名字的第一个词转小写，再接 @example.com', () => {
    expect(emailOf('Anna Haro')).toBe('anna@example.com');
    expect(emailOf('Mom')).toBe('mom@example.com');
  });

  it('沿用原界面的推导：带称谓的名字取到 “dr.”', () => {
    expect(emailOf('Dr. Reed')).toBe('dr.@example.com');
  });
});

describe('SEED_CONTACTS', () => {
  it('十位联系人，顺序与原界面一致（不是按字母排的）', () => {
    expect(SEED_CONTACTS.map(contact => contact.name)).toEqual([
      'Anna Haro',
      'Chris Lee',
      'Daniel Higgins',
      'David Taylor',
      'Freda Klein',
      'Hank Zakroff',
      'John Appleseed',
      'Kate Bell',
      'Mom',
      'Dr. Reed'
    ]);
  });

  it('姓名不重复，头像颜色都是十六进制色值', () => {
    expect(new Set(SEED_CONTACTS.map(contact => contact.name)).size).toBe(SEED_CONTACTS.length);
    for (const contact of SEED_CONTACTS) expect(contact.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
