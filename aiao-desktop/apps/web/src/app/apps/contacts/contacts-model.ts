import { Contact } from './contacts.entities';

/** 联系人编辑表单的字段。`id` 为空表示尚未落库的新联系人。 */
export interface ContactDraft {
  readonly id: string | null;
  readonly name: string;
  readonly role: string;
  readonly color: string;
  readonly email: string;
  readonly address: string;
  readonly position: number;
}

/** 当前编辑器：保存前保留基线，用于拒绝覆盖另一个窗口刚写入的修改。 */
export interface ContactEditor {
  readonly draft: ContactDraft;
  readonly base: ContactDraft | null;
}

export type ContactDraftField = 'name' | 'role' | 'email' | 'address';

/** 从实体生成编辑快照。 */
export const draftOf = (contact: Contact): ContactDraft => ({
  id: contact.id,
  name: contact.name,
  role: contact.role,
  color: contact.color,
  email: contact.email,
  address: contact.address,
  position: contact.position
});

/** 创建一个还没有保存的联系人草稿。 */
export const newDraft = (position: number): ContactDraft => ({
  id: null,
  name: '',
  role: '',
  color: '#0a84ff',
  email: '',
  address: '',
  position
});

/** 搜索姓名、职业、邮箱和地址。空查询返回原顺序。 */
export const filterContacts = (contacts: readonly Contact[], query: string): readonly Contact[] => {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return contacts;
  return contacts.filter(contact =>
    [contact.name, contact.role, contact.email, contact.address].some(value =>
      value.toLocaleLowerCase().includes(needle)
    )
  );
};

/** 规范化表单中的文本，避免只输入空格的记录落库。 */
export const normalizeDraft = (draft: ContactDraft): ContactDraft => ({
  ...draft,
  name: draft.name.trim(),
  role: draft.role.trim(),
  email: draft.email.trim(),
  address: draft.address.trim()
});

/** 保存前的表单校验。返回 null 表示可以写入。 */
export const contactValidationMessage = (draft: ContactDraft): string | null => {
  if (!draft.name) return 'Name is required.';
  if (!draft.role) return 'Role is required.';
  if (!draft.email) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) return 'Enter a valid email address.';
  if (!draft.address) return 'Home is required.';
  return null;
};

/** 比较联系人业务字段，忽略实体的更新时间。 */
export const sameContact = (left: ContactDraft, right: ContactDraft): boolean =>
  left.id === right.id &&
  left.name === right.name &&
  left.role === right.role &&
  left.color === right.color &&
  left.email === right.email &&
  left.address === right.address &&
  left.position === right.position;
