/** 侧栏里的一个设置分区。 */
export interface SettingsSection {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly bg: string;
  /** 搜索时除了分区名还匹配的词：分区里的设置项标签与常见别名（匹配不区分大小写）。 */
  readonly searchTerms: readonly string[];
}

/** 侧栏分区，组与组之间有一条分隔线。 */
export const SETTINGS_GROUPS: readonly (readonly SettingsSection[])[] = [
  [
    {
      id: 'wifi',
      name: 'Wi‑Fi',
      icon: 'g-wifi',
      bg: '#0a84ff',
      searchTerms: ['wifi', 'wi-fi', 'wireless', 'connection']
    },
    {
      id: 'bluetooth',
      name: 'Bluetooth',
      icon: 'g-bt',
      bg: '#0a84ff',
      searchTerms: ['devices', 'connect', 'disconnect', 'airpods', 'keyboard', 'trackpad', 'headphones', 'pair']
    },
    {
      id: 'network',
      name: 'Network',
      icon: 'g-network',
      bg: '#0a84ff',
      searchTerms: ['firewall', 'vpn', 'thunderbolt', 'bridge', 'ethernet']
    }
  ],
  [
    {
      id: 'general',
      name: 'General',
      icon: 'g-gear',
      bg: '#8e8e93',
      searchTerms: [
        'about',
        'software update',
        'storage',
        'airdrop',
        'handoff',
        'login items',
        'extensions',
        'language',
        'region',
        'date',
        'time',
        'sharing',
        'time machine',
        'macbook',
        'more info'
      ]
    },
    {
      id: 'appearance',
      name: 'Appearance',
      icon: 'g-display',
      bg: '#1d1d1f',
      searchTerms: [
        'light',
        'dark',
        'auto',
        'accent colour',
        'accent color',
        'highlight colour',
        'highlight color',
        'sidebar icon size',
        'scroll bars',
        'theme'
      ]
    },
    {
      id: 'wallpaper',
      name: 'Wallpaper',
      icon: 'g-globe',
      bg: '#30d158',
      searchTerms: ['desktop picture', 'background', 'picture', 'photo']
    },
    {
      id: 'dock',
      name: 'Desktop & Dock',
      icon: 'g-slider-h',
      bg: '#1d1d1f',
      searchTerms: [
        'desktop',
        'dock',
        'size',
        'magnification',
        'position',
        'minimise',
        'minimize',
        'genie',
        'scale effect',
        'hide',
        'auto hide',
        'animate',
        'indicators',
        'stage manager'
      ]
    },
    {
      id: 'displays',
      name: 'Displays',
      icon: 'g-display',
      bg: '#0a84ff',
      searchTerms: [
        'brightness',
        'automatically adjust brightness',
        'auto brightness',
        'true tone',
        'night shift',
        'colour profile',
        'color profile',
        'resolution',
        'refresh rate',
        'pro motion',
        'retina'
      ]
    },
    {
      id: 'sound',
      name: 'Sound',
      icon: 'g-vol-hi',
      bg: '#ff375f',
      searchTerms: ['volume', 'mute', 'output', 'input', 'alert sound', 'sound effects', 'speakers', 'airpods', 'audio']
    },
    {
      id: 'battery',
      name: 'Battery',
      icon: 'g-batt-glyph',
      bg: '#30d158',
      searchTerms: [
        'low power',
        'optimised battery charging',
        'optimized battery charging',
        'battery health',
        'condition',
        'maximum capacity',
        'cycle count',
        'charging',
        'power'
      ]
    },
    {
      id: 'notifications',
      name: 'Notifications',
      icon: 'g-info',
      bg: '#ff375f',
      searchTerms: ['do not disturb', 'dnd', 'focus', 'banners', 'alerts', 'notification centre', 'notification center']
    }
  ],
  [
    {
      id: 'privacy',
      name: 'Privacy & Security',
      icon: 'g-hand',
      bg: '#0a84ff',
      searchTerms: [
        'location services',
        'contacts',
        'calendars',
        'photos',
        'camera',
        'microphone',
        'screen recording',
        'full disk access',
        'filevault',
        'security',
        'permissions'
      ]
    }
  ]
];

/** 分区 id 不认识时落到「通用」。 */
export const DEFAULT_SECTION: SettingsSection = SETTINGS_GROUPS[1][0];

/** 按 id 找分区。 */
export const findSection = (id: string): SettingsSection =>
  SETTINGS_GROUPS.flat().find(section => section.id === id) ?? DEFAULT_SECTION;

/** 按分区名称与设置项标签筛选系统设置侧栏，并保留原有分组顺序。 */
export function filterSettingsGroups(
  groups: readonly (readonly SettingsSection[])[],
  query: string
): readonly (readonly SettingsSection[])[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return groups;
  return groups
    .map(group =>
      group.filter(
        section =>
          section.name.toLocaleLowerCase().includes(normalized) ||
          section.searchTerms.some(term => term.toLocaleLowerCase().includes(normalized))
      )
    )
    .filter(group => group.length);
}
