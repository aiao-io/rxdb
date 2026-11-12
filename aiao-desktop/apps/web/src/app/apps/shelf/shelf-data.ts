import type { DesktopAppId } from '../../services/desktop-apps';

/** 书架的一行：标题、副标题、封面种子与封面宽高比，以及 [名称, 说明] 列表。 */
export interface ShelfRow {
  readonly head: string;
  readonly sub: string;
  /** 封面照片序号 = 条目序号 + seed。 */
  readonly seed: number;
  readonly ratio: number;
  readonly items: readonly (readonly [string, string])[];
}

/** 一个媒体书架应用：页面大标题与各行内容。 */
export interface Shelf {
  readonly title: string;
  readonly rows: readonly ShelfRow[];
}

/** 四个媒体书架应用的内容：播客、电视、图书、App Store。 */
export const SHELVES: Readonly<Partial<Record<DesktopAppId, Shelf>>> = {
  podcasts: {
    title: 'Listen Now',
    rows: [
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
    ]
  },
  tv: {
    title: 'Home',
    rows: [
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
    ]
  },
  books: {
    title: 'Reading Now',
    rows: [
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
    ]
  },
  appstore: {
    title: 'Discover',
    rows: [
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
  }
};
