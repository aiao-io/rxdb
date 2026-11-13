import { Component, input } from '@angular/core';
const paths: Record<string, string> = {
  search: 'm21 21-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  cube: 'm12 3 9 5v8l-9 5-9-5V8l9-5Zm0 10 9-5M12 13 3 8m9 5v8M7.5 5.5l9 5',
  tree: 'M4 3v14a2 2 0 0 0 2 2h3M4 8h5M9 5h11v6H9zM9 16h11v6H9z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  filter: 'M4 5h16l-6 7v6l-4 2v-8L4 5Z',
  chevron: 'm9 5 7 7-7 7', down: 'm6 9 6 6 6-6', plus: 'M12 5v14M5 12h14',
  columns: 'M4 4h16v16H4zM10 4v16M16 4v16', download: 'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',
  upload: 'M12 16V4m-5 5 5-5 5 5M5 16v5h14v-5', check: 'm5 12 4 4L19 6',
  undo: 'M8 4 3 9l5 5M3 9h10a7 7 0 0 1 0 14', redo: 'm16 4 5 5-5 5m5-5H11a7 7 0 0 0 0 14',
  more: 'M5 12h.01M12 12h.01M19 12h.01', close: 'm6 6 12 12M6 18 18 6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  focus: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M8 8h8v8H8z',
  reset: 'M3 11a9 9 0 1 1 2 7M3 4v7h7', edit: 'm16 3 5 5-12 12H4v-5L16 3Z',
  branch: 'M6 4v16M6 8h8a4 4 0 0 0 4-4M3 20h6m6-16h6', info: 'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-7l1-7Z', trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  arrow: 'M5 12h14m-5-5 5 5-5 5', settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
  compare: 'M4 3v18m16-18v18M4 7h6l4 10h6M4 17h6l4-10h6', clock: 'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  panel: 'M3 4h18v16H3zM15 4v16', copy: 'M8 8h13v13H8zM3 16V3h13', link: 'm10 13 4-4m-6 7-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2-2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0'
};
@Component({ selector: 'bom2-icon', template: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="path()" /></svg>', styles: [':host { display:inline-flex;width:16px;height:16px;flex:none; } svg {width:100%;height:100%;}'] })
export class Icon { readonly name = input('cube'); readonly path = () => paths[this.name()] ?? paths['cube']; }
