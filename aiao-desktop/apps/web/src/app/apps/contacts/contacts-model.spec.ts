import { describe, expect, it } from 'vitest';

import { emailOf, HOME_ADDRESS, SEED_CONTACTS } from './contacts-data';
import {
  contactValidationMessage,
  draftOf,
  filterContacts,
  newDraft,
  normalizeDraft,
  sameContact,
  stepContact
} from './contacts-model';
import { Contact } from './contacts.entities';

const contact = (index: number): Contact =>
  ({
    id: `contact-${index}`,
    name: SEED_CONTACTS[index].name,
    role: SEED_CONTACTS[index].role,
    color: SEED_CONTACTS[index].color,
    email: emailOf(SEED_CONTACTS[index].name),
    address: HOME_ADDRESS,
    position: index
  }) as Contact;

describe('filterContacts', () => {
  const contacts = SEED_CONTACTS.map((_, index) => contact(index));

  it('空查询保留数据库顺序', () => {
    expect(filterContacts(contacts, ' ')).toEqual(contacts);
  });

  it('不区分大小写搜索姓名、职业、邮箱和地址', () => {
    expect(filterContacts(contacts, 'PHOTOGRAPHER').map(row => row.name)).toEqual(['Chris Lee']);
    expect(filterContacts(contacts, 'anna@example.com').map(row => row.name)).toEqual(['Anna Haro']);
    expect(filterContacts(contacts, 'cupertino').length).toBe(contacts.length);
  });
});

describe('contact drafts', () => {
  it('新建草稿包含默认头像色和空值', () => {
    expect(newDraft(10)).toEqual({
      id: null,
      name: '',
      role: '',
      color: '#0a84ff',
      email: '',
      address: '',
      position: 10
    });
  });

  it('实体快照可以恢复为相同的联系人字段', () => {
    const value = draftOf(contact(0));
    expect(sameContact(value, value)).toBe(true);
    expect(sameContact(value, { ...value, role: 'Changed' })).toBe(false);
  });

  it('保存前去掉首尾空格并拒绝不完整表单', () => {
    const value = normalizeDraft({
      ...newDraft(0),
      name: ' Anna ',
      role: ' Design ',
      email: ' anna@example.com ',
      address: ' Home '
    });
    expect(value.name).toBe('Anna');
    expect(value.email).toBe('anna@example.com');
    expect(contactValidationMessage(value)).toBeNull();
    expect(contactValidationMessage({ ...value, email: 'bad' })).toBe('Enter a valid email address.');
    expect(contactValidationMessage({ ...value, name: '' })).toBe('Name is required.');
  });
});

describe('stepContact', () => {
  const ids = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('上下移动选中项', () => {
    expect(stepContact(ids, 'b', 1)).toBe('c');
    expect(stepContact(ids, 'b', -1)).toBe('a');
  });

  it('还没选中时从第一行起算，到头不再移动', () => {
    expect(stepContact(ids, null, 1)).toBe('b');
    expect(stepContact(ids, null, -1)).toBeNull();
    expect(stepContact(ids, 'c', 1)).toBeNull();
    expect(stepContact(ids, 'a', -1)).toBeNull();
  });

  it('空列表与找不到的 id 返回 null', () => {
    expect(stepContact([], null, 1)).toBeNull();
    expect(stepContact(ids, 'gone', 1)).toBeNull();
  });
});
