/**
 * 磁盘「种类」标签 → 目录 key（Finder「种类」栏、简介面板、Spotlight、Quick Look 与预览失败提示共用同一套词汇；
 * 桌面叠放的 `kind` 另有一个 `File` 兜底值）。
 * 未知种类原样返回：那是外部数据（如远程应用自定义的 kind），不是 UI 文案。
 */
export function diskKindLabel(t: (key: string) => string, kind: string): string {
  switch (kind) {
    case 'Folder':
      return t('shell.overlay.folder');
    case 'File':
      return t('disk.kind.file');
    case 'Alias':
      return t('disk.kind.alias');
    case 'Application':
      return t('disk.kind.application');
    case 'Document':
      return t('disk.kind.document');
    case 'CSS style sheet':
      return t('disk.kind.cssStyleSheet');
    case 'CSV document':
      return t('disk.kind.csvDocument');
    case 'Disk image':
      return t('disk.kind.diskImage');
    case 'HEIC image':
      return t('disk.kind.heicImage');
    case 'HTML document':
      return t('disk.kind.htmlDocument');
    case 'JPEG image':
      return t('disk.kind.jpegImage');
    case 'JavaScript':
      return t('disk.kind.javaScript');
    case 'JSON':
      return t('disk.kind.json');
    case 'Keynote':
      return t('disk.kind.keynote');
    case 'Markdown':
      return t('disk.kind.markdown');
    case 'QuickTime movie':
      return t('disk.kind.quickTimeMovie');
    case 'MP3 audio':
      return t('disk.kind.mp3Audio');
    case 'MPEG-4 movie':
      return t('disk.kind.mpeg4Movie');
    case 'Numbers':
      return t('disk.kind.numbers');
    case 'PDF document':
      return t('disk.kind.pdfDocument');
    case 'Property List':
      return t('disk.kind.propertyList');
    case 'PNG image':
      return t('disk.kind.pngImage');
    case 'Python source':
      return t('disk.kind.pythonSource');
    case 'Shell script':
      return t('disk.kind.shellScript');
    case 'Swift source':
      return t('disk.kind.swiftSource');
    case 'TypeScript':
      return t('disk.kind.typeScript');
    case 'TrueType font':
      return t('disk.kind.trueTypeFont');
    case 'Plain text':
      return t('disk.kind.plainText');
    case 'WAV audio':
      return t('disk.kind.wavAudio');
    case 'Archive':
      return t('disk.kind.archive');
    case 'XML document':
      return t('disk.kind.xmlDocument');
    case 'YAML':
      return t('disk.kind.yaml');
    case 'ZIP archive':
      return t('disk.kind.zipArchive');
    default:
      return kind;
  }
}
