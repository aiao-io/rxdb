import type { MessageCatalog } from '@aiao/rxdb-i18n';

/** 本地字段加密演示页的简体中文文案目录。 */
export const encryptedZhMessages = {
  'page.encrypted.title': '本地字段加密演示',
  'page.encrypted.locked': '已锁定',
  'page.encrypted.unlocked': '已解锁',
  'page.encrypted.unlockTitle': '解锁数据库',
  'page.encrypted.firstUse':
    '首次使用：请设置一个密码短语，系统将用它加密您的数据。请牢记此密码短语，后续解锁需要输入相同的密码短语。',
  'page.encrypted.unlockHint': '输入密码短语以解密加密字段。密码短语不会离开您的设备。',
  'page.encrypted.passphraseLabel': '密码短语',
  'page.encrypted.passphrasePlaceholder': '输入密码短语…',
  'page.encrypted.unlock': '解锁',
  'page.encrypted.refresh': '刷新',
  'page.encrypted.lock': '锁定',
  'page.encrypted.createTitle': '添加加密用户',
  'page.encrypted.nameLabel': '姓名（明文）',
  'page.encrypted.cardLabel': '信用卡号（加密）',
  'page.encrypted.apiKeyLabel': 'API 密钥（加密）',
  'page.encrypted.saveUser': '保存用户',
  'page.encrypted.name': '姓名',
  'page.encrypted.card': '信用卡号',
  'page.encrypted.apiKey': 'API 密钥',
  'page.encrypted.encryptedBadge': '加密',
  'page.encrypted.empty': '暂无加密用户，请在上方添加。'
} as const;

/** 本地字段加密演示页的文案键。 */
export type EncryptedMessageKey = keyof typeof encryptedZhMessages;

/** 本地字段加密演示页的英文文案目录；键集合必须与简体中文目录一致。 */
export const encryptedEnMessages = {
  'page.encrypted.title': 'Local field encryption demo',
  'page.encrypted.locked': 'Locked',
  'page.encrypted.unlocked': 'Unlocked',
  'page.encrypted.unlockTitle': 'Unlock database',
  'page.encrypted.firstUse':
    'First use: set a passphrase to encrypt your data. Remember it because the same passphrase is required to unlock the database later.',
  'page.encrypted.unlockHint': 'Enter the passphrase to decrypt encrypted fields. It never leaves your device.',
  'page.encrypted.passphraseLabel': 'Passphrase',
  'page.encrypted.passphrasePlaceholder': 'Enter passphrase…',
  'page.encrypted.unlock': 'Unlock',
  'page.encrypted.refresh': 'Refresh',
  'page.encrypted.lock': 'Lock',
  'page.encrypted.createTitle': 'Add encrypted user',
  'page.encrypted.nameLabel': 'Name (plaintext)',
  'page.encrypted.cardLabel': 'Card number (encrypted)',
  'page.encrypted.apiKeyLabel': 'API key (encrypted)',
  'page.encrypted.saveUser': 'Save user',
  'page.encrypted.name': 'Name',
  'page.encrypted.card': 'Card number',
  'page.encrypted.apiKey': 'API key',
  'page.encrypted.encryptedBadge': 'Encrypted',
  'page.encrypted.empty': 'No encrypted users yet. Add one above.'
} satisfies Record<EncryptedMessageKey, string>;

/** 本地字段加密演示页的随包目录；三端演示共用同一份。 */
export const encryptedCatalogs: readonly MessageCatalog[] = [
  { locale: 'zh-Hans', namespace: 'app', messages: encryptedZhMessages },
  { locale: 'en', namespace: 'app', messages: encryptedEnMessages }
];
