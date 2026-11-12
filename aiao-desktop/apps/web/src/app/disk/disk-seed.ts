import { DESKTOP, DiskPath, HOME, TRASH } from './disk-path';
import { DiskStore } from './disk-store';
import { PdfDocument, textPdf } from './formats/pdf';
import { infoPlist } from './formats/plist';
import { StubFormat, stubFile } from './formats/stubs';
import { synthWav } from './formats/wav';
import {
  AURORA_INDEX,
  AURORA_SYNTH_TS,
  CLEANTYPE_MAIN,
  CLEANTYPE_PACKAGE,
  DESKTOP_WEB_INDEX,
  DESKTOP_WEB_README,
  INTERFACE_GUIDELINES,
  MATERIALS_SPEC,
  MOTION_AUDIT,
  OLD_DRAFT_MD,
  ON_RESTRAINT_MD,
  PRASENX_TXT,
  SHADOW_NOTES_MD,
  TODO_MD
} from './seed-text';
import { nameSeed, shotKind } from './thumbnails';

/** 要生成的一张图：程序化插画的构图、输出尺寸与格式；截图会叠上菜单栏和一个窗口。 */
export interface SeedImage {
  readonly scene: number;
  readonly variant: number;
  readonly width: number;
  readonly height: number;
  readonly format: 'png' | 'jpeg';
  readonly screenshot: boolean;
}

export type SeedContent =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly image: SeedImage }
  | { readonly type: 'pdf'; readonly document: PdfDocument }
  | { readonly type: 'wav'; readonly seconds: number }
  | { readonly type: 'stub'; readonly format: StubFormat };

export interface SeedFile {
  readonly path: DiskPath;
  readonly content: SeedContent;
}

/** 内置磁盘：首次打开时原样复制进 OPFS。 */
export interface DiskSeed {
  readonly folders: readonly DiskPath[];
  readonly files: readonly SeedFile[];
}

/** 浏览器里把插画渲染成 PNG / JPEG；单测里换成假的编码器。 */
export type ImageEncoder = (image: SeedImage) => Promise<Uint8Array>;

const APPLICATIONS = [
  'Safari',
  'Mail',
  'Messages',
  'Maps',
  'Photos',
  'Notes',
  'Calendar',
  'Music',
  'Terminal',
  'Calculator',
  'System Settings',
  'Preview',
  'Reminders',
  'FaceTime',
  'App Store',
  'Podcasts',
  'TV',
  'Weather',
  'Stocks',
  'Books',
  'Contacts',
  'Freeform',
  'Clock'
];

const text = (path: DiskPath, value: string): SeedFile => ({ path, content: { type: 'text', text: value } });
const pdf = (path: DiskPath, document: PdfDocument): SeedFile => ({ path, content: { type: 'pdf', document } });
const stub = (path: DiskPath, format: StubFormat): SeedFile => ({ path, content: { type: 'stub', format } });

/** 图片用文件名定构图，和 Finder 缩略图同一套，所以缩略图就是文件本身的样子。 */
function image(
  path: DiskPath,
  format: SeedImage['format'],
  size: readonly [number, number],
  screenshot = false
): SeedFile {
  const name = path.at(-1) ?? '';
  return {
    path,
    content: {
      type: 'image',
      image: { scene: nameSeed(name), variant: shotKind(name), width: size[0], height: size[1], format, screenshot }
    }
  };
}

function application(name: string): SeedFile[] {
  const contents = ['Applications', `${name}.app`, 'Contents'];
  const identifier = `io.aiao.desktop.${name.toLowerCase().replace(/\s+/g, '-')}`;
  return [
    text([...contents, 'Info.plist'], infoPlist({ name, identifier, version: '26.0' })),
    text([...contents, 'PkgInfo'], 'APPL????')
  ];
}

const projects = [...DESKTOP, 'Projects'];
const documents = [...HOME, 'Documents'];
const downloads = [...HOME, 'Downloads'];

export function buildSeed(): DiskSeed {
  return {
    folders: [
      ['Library', 'Caches'],
      ['Library', 'Preferences'],
      ['System', 'Library'],
      ['System', 'Volumes'],
      [...HOME, 'Public', 'Drop Box'],
      ['Users', 'Shared']
    ],
    files: [
      ...APPLICATIONS.flatMap(application),
      stub(['Library', 'Fonts', 'SFPro.ttf'], 'ttf'),
      text([...projects, 'desktop-web', 'index.html'], DESKTOP_WEB_INDEX),
      text([...projects, 'desktop-web', 'README.md'], DESKTOP_WEB_README),
      image([...projects, 'desktop-web', 'screenshot.png'], 'png', [1280, 800], true),
      text([...projects, 'cleantype', 'main.swift'], CLEANTYPE_MAIN),
      text([...projects, 'cleantype', 'Package.swift'], CLEANTYPE_PACKAGE),
      text([...projects, 'aurora-synth', 'synth.ts'], AURORA_SYNTH_TS),
      text([...projects, 'aurora-synth', 'index.html'], AURORA_INDEX),
      text([...projects, 'todo.md'], TODO_MD),
      text([...DESKTOP, 'prasenx.txt'], PRASENX_TXT),
      image([...DESKTOP, 'Screenshot 2026-07-27 at 4.34.11 PM.png'], 'png', [1440, 900], true),
      pdf([...DESKTOP, 'Interface Guidelines.pdf'], INTERFACE_GUIDELINES),
      pdf([...documents, 'Specs', 'materials.pdf'], MATERIALS_SPEC),
      pdf([...documents, 'Specs', 'motion-audit.pdf'], MOTION_AUDIT),
      text([...documents, 'Writing', 'on-restraint.md'], ON_RESTRAINT_MD),
      text([...documents, 'Writing', 'shadow-notes.md'], SHADOW_NOTES_MD),
      stub([...documents, 'design-review.key'], 'zip'),
      stub([...documents, 'roadmap-2026.numbers'], 'zip'),
      stub([...downloads, 'Xcode_26.xip'], 'xip'),
      stub([...downloads, 'sf-symbols-7.dmg'], 'dmg'),
      stub([...downloads, 'wallpaper-tahoe-6k.heic'], 'heic'),
      stub([...downloads, 'render-final.mp4'], 'mp4'),
      stub([...HOME, 'Movies', 'interaction-study.mp4'], 'mp4'),
      stub([...HOME, 'Movies', 'capture-timelapse.mov'], 'mov'),
      { path: [...HOME, 'Music', 'aurora-synth-demo.wav'], content: { type: 'wav', seconds: 4.2 } },
      stub([...HOME, 'Music', 'lofi-loop.mp3'], 'mp3'),
      image([...HOME, 'Pictures', 'lake-braies.jpg'], 'jpeg', [1500, 1000]),
      image([...HOME, 'Pictures', 'dolomites-dawn.jpg'], 'jpeg', [1500, 1000]),
      image([...HOME, 'Pictures', 'night-sky.jpg'], 'jpeg', [1500, 1000]),
      text([...TRASH, 'old-draft.md'], OLD_DRAFT_MD)
    ]
  };
}

/** aurora-synth 的演示：C 大七和弦的分解与收尾。 */
const DEMO_NOTES = [261.63, 329.63, 392, 493.88, 523.25, 493.88, 392, 329.63].map((frequency, i) => ({
  start: i * 0.42,
  duration: 1.1,
  frequency,
  gain: 0.7
}));

const encoder = new TextEncoder();

async function render(content: SeedContent, encodeImage: ImageEncoder): Promise<Uint8Array> {
  switch (content.type) {
    case 'text':
      return encoder.encode(content.text);
    case 'image':
      return encodeImage(content.image);
    case 'pdf':
      return textPdf(content.document);
    case 'wav':
      return synthWav({ seconds: content.seconds, sampleRate: 22_050, notes: DEMO_NOTES });
    case 'stub':
      return stubFile(content.format);
  }
}

/** 把内置磁盘写进存储后端：先建空文件夹，再逐个写文件。 */
export async function writeSeed(store: DiskStore, seed: DiskSeed, encodeImage: ImageEncoder): Promise<void> {
  for (const folder of seed.folders) await store.mkdir(folder);
  for (const file of seed.files) await store.write(file.path, await render(file.content, encodeImage));
}
