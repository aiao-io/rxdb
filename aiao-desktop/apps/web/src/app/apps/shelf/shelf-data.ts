/** 四个媒体书架应用：播客、电视、图书、App Store。 */
export const SHELF_APPS = ['podcasts', 'tv', 'books', 'appstore'] as const;

export type ShelfAppId = (typeof SHELF_APPS)[number];

/** 书架的一行：标题、副标题、封面种子与封面宽高比，以及 [名称, 说明] 列表。 */
export interface ShelfRow {
  readonly head: string;
  readonly sub: string;
  /** 封面照片序号 = 条目序号 + seed。 */
  readonly seed: number;
  readonly ratio: number;
  readonly items: readonly (readonly [string, string])[];
}

/** 各书架页面的大标题；这是界面文字，不进库。 */
export const SHELF_TITLES: Readonly<Record<ShelfAppId, string>> = {
  podcasts: 'Listen Now',
  tv: 'Home',
  books: 'Reading Now',
  appstore: 'Discover'
};

/** 四个书架的初始内容（首次打开时写进库），之后以库里的 `ShelfSection` / `ShelfItem` 为准。 */
export const SHELF_ROWS: Readonly<Record<ShelfAppId, readonly ShelfRow[]>> = {
  podcasts: [
    {
      head: 'Up Next',
      sub: 'Six shows · 42 unplayed episodes',
      seed: 1,
      ratio: 1,
      items: [
        ['Design Details', 'Ep. 512 · Liquid Glass'],
        ['Syntax', 'Ep. 880 · One-file apps'],
        ['Acquired', 'Apple, Part IV'],
        ['The Talk Show', 'With John Gruber']
      ]
    },
    {
      head: 'New Episodes',
      sub: '',
      seed: 5,
      ratio: 1,
      items: [
        ['Shop Talk', '2 hr ago'],
        ['Ship It', '5 hr ago'],
        ['Frontend First', 'Yesterday'],
        ['Hanselminutes', 'Yesterday']
      ]
    }
  ],
  tv: [
    {
      head: 'Continue Watching',
      sub: 'Apple TV+',
      seed: 2,
      ratio: 0.68,
      items: [
        ['Severance', 'S2 · E4'],
        ['Silo', 'S2 · E7'],
        ['For All Mankind', 'S5 · E1'],
        ['Foundation', 'S3 · E9']
      ]
    },
    {
      head: 'New & Noteworthy',
      sub: '',
      seed: 6,
      ratio: 0.68,
      items: [
        ['The Studio', 'Comedy'],
        ['Presumed Innocent', 'Thriller'],
        ['Slow Horses', 'Drama'],
        ['Shrinking', 'Comedy']
      ]
    }
  ],
  books: [
    {
      head: 'Current',
      sub: '3 books in progress',
      seed: 3,
      ratio: 0.66,
      items: [
        ['Refactoring UI', 'Wathan & Schoger'],
        ['The Design of Everyday Things', 'Norman'],
        ['Shape Up', 'Singer'],
        ['Thinking in Systems', 'Meadows']
      ]
    },
    {
      head: 'Want to Read',
      sub: '',
      seed: 7,
      ratio: 0.66,
      items: [
        ['Creative Selection', 'Kocienda'],
        ['Steal Like an Artist', 'Kleon'],
        ['The Making of Prince of Persia', 'Mechner'],
        ['Hackers & Painters', 'Graham']
      ]
    }
  ],
  appstore: [
    {
      head: 'Featured',
      sub: 'Handpicked for you',
      seed: 4,
      ratio: 1,
      items: [
        ['CleanType', 'Typography utility'],
        ['Aurora Synth', 'Music'],
        ['Pattern Craft', 'Graphics'],
        ['Spark UI', 'Developer tools']
      ]
    },
    {
      head: 'Top Free',
      sub: '',
      seed: 0,
      ratio: 1,
      items: [
        ['Raycast', 'Productivity'],
        ['Arc', 'Browser'],
        ['Figma', 'Design'],
        ['Warp', 'Terminal']
      ]
    }
  ]
};
