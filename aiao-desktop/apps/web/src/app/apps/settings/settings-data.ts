/** 侧栏里的一个设置分区。 */
export interface SettingsSection {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly bg: string;
}

/** 侧栏分区，组与组之间有一条分隔线。 */
export const SETTINGS_GROUPS: readonly (readonly SettingsSection[])[] = [
  [
    { id: 'wifi', name: 'Wi‑Fi', icon: 'g-wifi', bg: '#0a84ff' },
    { id: 'bluetooth', name: 'Bluetooth', icon: 'g-bt', bg: '#0a84ff' },
    { id: 'network', name: 'Network', icon: 'g-network', bg: '#0a84ff' }
  ],
  [
    { id: 'general', name: 'General', icon: 'g-gear', bg: '#8e8e93' },
    { id: 'appearance', name: 'Appearance', icon: 'g-display', bg: '#1d1d1f' },
    { id: 'wallpaper', name: 'Wallpaper', icon: 'g-globe', bg: '#30d158' },
    { id: 'dock', name: 'Desktop & Dock', icon: 'g-slider-h', bg: '#1d1d1f' },
    { id: 'displays', name: 'Displays', icon: 'g-display', bg: '#0a84ff' },
    { id: 'sound', name: 'Sound', icon: 'g-vol-hi', bg: '#ff375f' },
    { id: 'battery', name: 'Battery', icon: 'g-batt-glyph', bg: '#30d158' }
  ],
  [{ id: 'privacy', name: 'Privacy & Security', icon: 'g-hand', bg: '#0a84ff' }]
];

/** 分区 id 不认识时落到「通用」。 */
export const DEFAULT_SECTION: SettingsSection = SETTINGS_GROUPS[1][0];

/** 按 id 找分区。 */
export const findSection = (id: string): SettingsSection =>
  SETTINGS_GROUPS.flat().find(section => section.id === id) ?? DEFAULT_SECTION;
