/** 可点击的菜单项。`checked` 只要在任一项上出现，整份菜单就会留出勾选列。 */
export interface MenuCommand {
  readonly id: string;
  readonly label: string;
  readonly key?: string;
  readonly icon?: string;
  readonly disabled?: boolean;
  readonly checked?: boolean;
  readonly run?: () => void;
}

/** 菜单里的小标题。 */
export interface MenuHeading {
  readonly head: string;
}

/** 帮助菜单顶部的搜索框。 */
export interface MenuSearchField {
  readonly field: string;
}

/** 菜单条目；`'-'` 是分隔线。 */
export type MenuEntry = MenuCommand | MenuHeading | MenuSearchField | '-';

/** 菜单栏上的一个标题及其下拉项。 */
export interface MenuSection {
  readonly label: string;
  readonly items: readonly MenuEntry[];
}

export const isMenuCommand = (entry: MenuEntry): entry is MenuCommand => typeof entry === 'object' && 'id' in entry;

/** 菜单栏标题的简写。 */
export const section = (label: string, items: readonly MenuEntry[]): MenuSection => ({ label, items });
