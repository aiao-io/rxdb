import { describe, expect, it, vi } from 'vitest';

import { DESKTOP, HOME, TRASH } from './disk-path';
import { SeedImage, buildSeed, writeSeed } from './disk-seed';
import { readPdfText } from './formats/pdf';
import { MemoryDiskStore } from './memory-disk-store';

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const fakeImage = (image: SeedImage): Promise<Uint8Array> =>
  Promise.resolve(new TextEncoder().encode(`${image.format}:${image.width}x${image.height}`));

/** 改写前虚拟文件系统里的全部条目：名字与层级都要原样保留。 */
const LEGACY_FILES = [
  'Library/Fonts/SFPro.ttf',
  'Users/prasenjit/Desktop/Projects/desktop-web/index.html',
  'Users/prasenjit/Desktop/Projects/desktop-web/README.md',
  'Users/prasenjit/Desktop/Projects/desktop-web/screenshot.png',
  'Users/prasenjit/Desktop/Projects/cleantype/main.swift',
  'Users/prasenjit/Desktop/Projects/cleantype/Package.swift',
  'Users/prasenjit/Desktop/Projects/aurora-synth/synth.ts',
  'Users/prasenjit/Desktop/Projects/aurora-synth/index.html',
  'Users/prasenjit/Desktop/Projects/todo.md',
  'Users/prasenjit/Desktop/prasenx.txt',
  'Users/prasenjit/Desktop/Screenshot 2026-07-27 at 4.34.11 PM.png',
  'Users/prasenjit/Desktop/Interface Guidelines.pdf',
  'Users/prasenjit/Documents/Specs/materials.pdf',
  'Users/prasenjit/Documents/Specs/motion-audit.pdf',
  'Users/prasenjit/Documents/Writing/on-restraint.md',
  'Users/prasenjit/Documents/Writing/shadow-notes.md',
  'Users/prasenjit/Documents/design-review.key',
  'Users/prasenjit/Documents/roadmap-2026.numbers',
  'Users/prasenjit/Downloads/Xcode_26.xip',
  'Users/prasenjit/Downloads/sf-symbols-7.dmg',
  'Users/prasenjit/Downloads/wallpaper-tahoe-6k.heic',
  'Users/prasenjit/Downloads/render-final.mp4',
  'Users/prasenjit/Movies/interaction-study.mp4',
  'Users/prasenjit/Movies/capture-timelapse.mov',
  'Users/prasenjit/Music/aurora-synth-demo.wav',
  'Users/prasenjit/Music/lofi-loop.mp3',
  'Users/prasenjit/Pictures/lake-braies.jpg',
  'Users/prasenjit/Pictures/dolomites-dawn.jpg',
  'Users/prasenjit/Pictures/night-sky.jpg',
  'Users/prasenjit/.Trash/old-draft.md'
];

const LEGACY_FOLDERS = [
  'Applications',
  'Library/Caches',
  'Library/Preferences',
  'System/Library',
  'System/Volumes',
  'Users/prasenjit/Public/Drop Box',
  'Users/Shared'
];

async function seededStore(): Promise<MemoryDiskStore> {
  const store = new MemoryDiskStore();
  await writeSeed(store, buildSeed(), fakeImage);
  return store;
}

describe('buildSeed', () => {
  it('保留改写前的每个文件与空文件夹', () => {
    const seed = buildSeed();
    const files = seed.files.map(file => file.path.join('/'));
    expect(files).toEqual(expect.arrayContaining(LEGACY_FILES));
    expect(seed.folders.map(folder => folder.join('/'))).toEqual(expect.arrayContaining(LEGACY_FOLDERS));
  });

  it('内置磁盘不自带 .app 包：它们是应用清单的系统投影，由应用目录服务对账写入（D-17）', () => {
    const seed = buildSeed();
    expect(seed.files.filter(file => file.path[0] === 'Applications')).toEqual([]);
    expect(seed.folders.map(folder => folder.join('/'))).toContain('Applications');
  });

  it('图片按 Finder 缩略图的同一套构图生成，截图带桌面框架', () => {
    const images = buildSeed().files.flatMap(file => (file.content.type === 'image' ? [file] : []));
    expect(images.map(file => file.path.at(-1))).toEqual(
      expect.arrayContaining(['screenshot.png', 'lake-braies.jpg', 'night-sky.jpg'])
    );
    const shot = images.find(file => file.path.at(-1) === 'Screenshot 2026-07-27 at 4.34.11 PM.png');
    expect(shot?.content).toMatchObject({ type: 'image', image: { format: 'png', screenshot: true } });
    const photo = images.find(file => file.path.at(-1) === 'night-sky.jpg');
    expect(photo?.content).toMatchObject({ type: 'image', image: { format: 'jpeg', screenshot: false } });
  });
});

describe('writeSeed', () => {
  it('文本文件写入真实内容', async () => {
    const store = await seededStore();
    const note = decode(await store.read([...DESKTOP, 'prasenx.txt']));
    expect(note).toContain('cat prasenx.txt');
    expect(decode(await store.read([...DESKTOP, 'Projects', 'cleantype', 'main.swift']))).toContain(
      'import Foundation'
    );
    expect(decode(await store.read([...TRASH, 'old-draft.md']))).toMatch(/^# /);
  });

  it('PDF 能读回界面指南的各节，音频与占位文件有真实字节', async () => {
    const store = await seededStore();
    const guidelines = readPdfText(await store.read([...DESKTOP, 'Interface Guidelines.pdf']));
    expect(guidelines?.title).toBe('Interface Guidelines');
    expect(guidelines?.sections.map(section => section.title)).toEqual([
      '1 · Materials',
      '2 · Depth',
      '3 · Motion',
      '4 · Pointer',
      '5 · Restraint'
    ]);
    const wav = await store.read([...HOME, 'Music', 'aurora-synth-demo.wav']);
    expect(decode(wav.slice(0, 4))).toBe('RIFF');
    expect(decode((await store.read([...HOME, 'Downloads', 'Xcode_26.xip'])).slice(0, 4))).toBe('xar!');
  });

  it('图片交给编码器生成', async () => {
    const encode = vi.fn(fakeImage);
    const store = new MemoryDiskStore();
    await writeSeed(store, buildSeed(), encode);
    expect(decode(await store.read([...HOME, 'Pictures', 'night-sky.jpg']))).toMatch(/^jpeg:\d+x\d+$/);
    expect(encode).toHaveBeenCalledTimes(buildSeed().files.filter(file => file.content.type === 'image').length);
  });

  it('空文件夹也建好，包括 /Applications', async () => {
    const store = await seededStore();
    expect(await store.kindOf(['Applications'])).toBe('directory');
    expect(await store.list(['Applications'])).toEqual([]);
    expect(await store.kindOf(['Users', 'prasenjit', 'Public', 'Drop Box'])).toBe('directory');
    expect(await store.list(['Library', 'Caches'])).toEqual([]);
  });
});
