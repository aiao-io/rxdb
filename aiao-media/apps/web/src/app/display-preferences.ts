/**
 * 页面排版偏好：内容区最大宽度、卡片大小和对齐方式。
 *
 * 偏好只描述这台设备的屏幕怎么用，保存在当前浏览器，不随工作区备份或账号同步。
 * 数字都集中在下面的选项表里：界面按它生成选项，样式按它取宽度，瀑布流按它算列数。
 */

/** 页面宽度档位；`max` 是内容区（不含两侧留白）的最大宽度，`null` 表示不限制。 */
export const pageWidthOptions = [
  { id: 'compact', label: '紧凑', max: 1200 },
  { id: 'standard', label: '标准', max: 1600 },
  { id: 'wide', label: '宽屏', max: 2200 },
  // 3440 宽带鱼屏减去侧栏与两侧留白后约 3170，默认档能完整容纳它。
  { id: 'ultra', label: '超宽', max: 3200 },
  { id: 'full', label: '铺满窗口', max: null }
] as const;

/**
 * 卡片大小档位。窄窗口里列数由最小宽度决定（`feed` 是发现灵感瀑布流单列、`library` 是我的图片网格单张卡片的
 * 最小宽度）；窗口宽到放得下更多列时，`columns` 给列数封顶，多出来的宽度让卡片变大而不是留白。
 * 我的图片每页 24 张，上限取 24 的约数，排满的每一行都是整行。
 */
export const cardSizeOptions = [
  { id: 'small', label: '小', feed: 150, library: 240, columns: 12 },
  { id: 'medium', label: '中', feed: 190, library: 300, columns: 8 },
  { id: 'large', label: '大', feed: 250, library: 380, columns: 6 },
  { id: 'xlarge', label: '特大', feed: 320, library: 480, columns: 4 }
] as const;

/** 内容区窄于窗口时的摆放位置。 */
export const contentAlignOptions = [
  { id: 'center', label: '居中', hint: '两侧留白相等' },
  { id: 'start', label: '靠左', hint: '紧贴导航' }
] as const;

export type PageWidth = (typeof pageWidthOptions)[number]['id'];
export type CardSize = (typeof cardSizeOptions)[number]['id'];
export type ContentAlign = (typeof contentAlignOptions)[number]['id'];

export interface DisplayPreferences {
  pageWidth: PageWidth;
  cardSize: CardSize;
  align: ContentAlign;
}

/** 保存偏好的 localStorage 键；格式变化时递增版本号，旧值不迁移、按默认处理。 */
export const displayStorageKey = 'aiao-media-display-v1';
export const defaultDisplayPreferences: Readonly<DisplayPreferences> = {
  pageWidth: 'ultra',
  cardSize: 'medium',
  align: 'center'
};
type DisplayStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function lookup<T extends { id: string }>(options: readonly T[], id: T['id']): T {
  const found = options.find(option => option.id === id);
  if (!found) throw new Error(`未知的显示选项：${id}`);
  return found;
}

/** 页面宽度档位对应的内容区最大宽度（px）；「铺满窗口」为 null。 */
export function pageMaxWidth(width: PageWidth): number | null {
  return lookup(pageWidthOptions, width).max;
}

/** 发现灵感瀑布流里单列的最小宽度（px）。 */
export function feedColumnMin(size: CardSize): number {
  return lookup(cardSizeOptions, size).feed;
}

/** 我的图片网格里单张卡片的最小宽度（px）。 */
export function libraryCardMin(size: CardSize): number {
  return lookup(cardSizeOptions, size).library;
}

/** 发现灵感与我的图片一行最多放几列。 */
export function maxColumns(size: CardSize): number {
  return lookup(cardSizeOptions, size).columns;
}

/** 是否与出厂设置完全一致；「恢复默认」据此禁用。 */
export function isDefaultDisplay(preferences: DisplayPreferences): boolean {
  return (
    preferences.pageWidth === defaultDisplayPreferences.pageWidth &&
    preferences.cardSize === defaultDisplayPreferences.cardSize &&
    preferences.align === defaultDisplayPreferences.align
  );
}

function pick<T extends { id: string }>(options: readonly T[], value: unknown, fallback: T['id']): T['id'] {
  return options.find(option => option.id === value)?.id ?? fallback;
}

/**
 * 读取已保存的偏好。显示偏好只影响排版，不关系数据安全，所以存储被禁用、内容损坏或某一项无法识别时
 * 都不报错：缺失的项使用默认值，其余合法的选择照常保留。
 */
export function readDisplayPreferences(storage: DisplayStorage): DisplayPreferences {
  let saved: string | null;
  try {
    saved = storage.getItem(displayStorageKey);
  } catch {
    return { ...defaultDisplayPreferences };
  }
  let value: unknown;
  try {
    value = saved ? JSON.parse(saved) : null;
  } catch {
    value = null;
  }
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    pageWidth: pick(pageWidthOptions, record['pageWidth'], defaultDisplayPreferences.pageWidth),
    cardSize: pick(cardSizeOptions, record['cardSize'], defaultDisplayPreferences.cardSize),
    align: pick(contentAlignOptions, record['align'], defaultDisplayPreferences.align)
  };
}

/** 保存偏好，只写入已知的三项；写入失败时抛出，由界面提示「仅本次有效」。 */
export function saveDisplayPreferences(storage: DisplayStorage, preferences: DisplayPreferences): void {
  const { pageWidth, cardSize, align } = preferences;
  storage.setItem(displayStorageKey, JSON.stringify({ pageWidth, cardSize, align }));
}

/** 删除已保存的偏好，回到默认值。 */
export function clearDisplayPreferences(storage: DisplayStorage): void {
  storage.removeItem(displayStorageKey);
}
