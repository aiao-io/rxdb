/** 可选主题：名称与明暗。名称必须与应用样式里启用的 daisyUI 主题一致。 */
export interface ThemeOption {
  /** 主题名，即 `data-theme` 的值。 */
  readonly name: string;
  /** 是否深色主题。 */
  readonly dark: boolean;
}

const light = (name: string): ThemeOption => ({ name, dark: false });
const dark = (name: string): ThemeOption => ({ name, dark: true });

/** daisyUI 5 内置主题目录；应用通过 {@link pickThemes} 选出样式里实际启用的那部分。 */
export const DAISYUI_THEMES: readonly ThemeOption[] = [
  light('light'),
  dark('dark'),
  light('cupcake'),
  light('bumblebee'),
  light('emerald'),
  light('corporate'),
  dark('synthwave'),
  light('retro'),
  light('cyberpunk'),
  light('valentine'),
  dark('halloween'),
  light('garden'),
  dark('forest'),
  light('aqua'),
  light('lofi'),
  light('pastel'),
  light('fantasy'),
  light('wireframe'),
  dark('black'),
  dark('luxury'),
  dark('dracula'),
  light('cmyk'),
  light('autumn'),
  dark('business'),
  light('acid'),
  light('lemonade'),
  dark('night'),
  dark('coffee'),
  light('winter'),
  dark('dim'),
  light('nord'),
  dark('sunset'),
  light('caramellatte'),
  dark('abyss'),
  light('silk')
];

/** 跟随系统明暗的伪主题名。 */
export const SYSTEM_THEME = 'system';

/**
 * 从 daisyUI 目录里按名字挑选主题。
 * @param names - 主题名，顺序即展示顺序。
 * @returns 主题选项。
 * @throws 名字不在目录中时抛错。
 */
export function pickThemes(names: readonly string[]): ThemeOption[] {
  return names.map(name => {
    const found = DAISYUI_THEMES.find(theme => theme.name === name);
    if (!found) throw new Error(`Unknown theme "${name}"`);
    return found;
  });
}

const preferred = (themes: readonly ThemeOption[], wantDark: boolean): string | undefined => {
  const exact = themes.find(theme => theme.name === (wantDark ? 'dark' : 'light'));
  return (exact ?? themes.find(theme => theme.dark === wantDark))?.name;
};

/**
 * 把主题偏好解析成具体主题名。
 * @param name - 偏好里的主题名，`system` 跟随系统。
 * @param systemDark - 系统当前是否深色。
 * @param themes - 可选主题。
 * @returns 要写入 `data-theme` 的主题名。
 */
export function resolveThemeName(name: string, systemDark: boolean, themes: readonly ThemeOption[]): string {
  if (name !== SYSTEM_THEME) return name;
  return preferred(themes, systemDark) ?? (systemDark ? 'dark' : 'light');
}

/**
 * 顶栏主题按钮的下一个状态：system → 浅色 → 深色 → system。
 * @param current - 当前主题偏好。
 * @param themes - 可选主题。
 * @returns 下一个主题偏好；不在循环里的主题回到浅色。
 */
export function nextThemeName(current: string, themes: readonly ThemeOption[]): string {
  const sequence = [SYSTEM_THEME, preferred(themes, false), preferred(themes, true)].filter(
    (name, index, all): name is string => name !== undefined && all.indexOf(name) === index
  );
  const index = sequence.indexOf(current);
  if (index === -1) return sequence[1] ?? SYSTEM_THEME;
  return sequence[(index + 1) % sequence.length];
}

/**
 * 主题的显示名：浅色 / 深色 / 跟随系统走翻译，其余 daisyUI 主题名是专有名词，仅首字母大写。
 * @param name - 主题名或 `system`。
 * @param translate - 翻译函数。
 * @returns 显示名。
 */
export function themeDisplayName(name: string, translate: (key: string) => string): string {
  if (name === 'light' || name === 'dark' || name === SYSTEM_THEME) return translate(`theme.${name}`);
  return name.charAt(0).toUpperCase() + name.slice(1);
}
