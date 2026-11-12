export interface AppBundleInfo {
  readonly name: string;
  readonly identifier: string;
  readonly version: string;
}

const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
};

const escapeXml = (text: string): string => text.replace(/[&<>"']/g, char => XML_ESCAPES[char]);

/** 程序包 `Contents/Info.plist` 的 XML 属性列表。 */
export function infoPlist(app: AppBundleInfo): string {
  const entries: readonly (readonly [string, string])[] = [
    ['CFBundleDevelopmentRegion', 'en'],
    ['CFBundleDisplayName', app.name],
    ['CFBundleExecutable', app.name],
    ['CFBundleIdentifier', app.identifier],
    ['CFBundleInfoDictionaryVersion', '6.0'],
    ['CFBundleName', app.name],
    ['CFBundlePackageType', 'APPL'],
    ['CFBundleShortVersionString', app.version],
    ['LSMinimumSystemVersion', '26.0']
  ];
  const body = entries.map(([key, value]) => `\t<key>${key}</key>\n\t<string>${escapeXml(value)}</string>`).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    body,
    '</dict>',
    '</plist>',
    ''
  ].join('\n');
}
