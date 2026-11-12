/** 一位初始联系人：姓名、职业、头像颜色。 */
export interface ContactSeed {
  readonly name: string;
  readonly role: string;
  readonly color: string;
}

/** 联系人卡片 home 一栏的初始地址，所有初始联系人相同。 */
export const HOME_ADDRESS = 'Cupertino, CA';

/** 初始联系人，顺序即列表顺序。 */
export const SEED_CONTACTS: readonly ContactSeed[] = [
  { name: 'Anna Haro', role: 'Product design', color: '#0a84ff' },
  { name: 'Chris Lee', role: 'Photographer', color: '#ff2d55' },
  { name: 'Daniel Higgins', role: 'Engineering manager', color: '#ffd60a' },
  { name: 'David Taylor', role: 'Motion design', color: '#ff9f0a' },
  { name: 'Freda Klein', role: 'Architect', color: '#a2845e' },
  { name: 'Hank Zakroff', role: 'Type designer', color: '#5e5ce6' },
  { name: 'John Appleseed', role: 'iOS engineer', color: '#30d158' },
  { name: 'Kate Bell', role: 'Frontend', color: '#64d2ff' },
  { name: 'Mom', role: 'Family', color: '#ff375f' },
  { name: 'Dr. Reed', role: 'Dentist', color: '#8e8e93' }
];

/** 初始邮箱沿用原界面的推导：名字的第一个词转小写，再接 `@example.com`。 */
export const emailOf = (name: string): string => `${name.split(' ')[0].toLowerCase()}@example.com`;
