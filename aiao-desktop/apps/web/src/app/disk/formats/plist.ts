export interface AppBundleInfo {
  readonly name: string;
  readonly identifier: string;
  readonly version: string;
  /**
   * 应用清单里的 id（D-17）：写进包里，包就能按它回到清单，不靠显示名匹配。
   * 没有它的是此前的手写种子写出的旧包，升级时按冻结的旧名单一次性认领。
   */
  readonly appId?: string;
  /** 运行来源（`builtin-component` / `bundled-html` / `remote-web`）。 */
  readonly runtime?: string;
}

const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
};

const XML_UNESCAPES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(XML_ESCAPES).map(([char, entity]) => [entity, char])
);

const escapeXml = (text: string): string => text.replace(/[&<>"']/g, char => XML_ESCAPES[char]);

const unescapeXml = (text: string): string =>
  text.replace(/&(?:amp|lt|gt|quot|apos);/g, entity => XML_UNESCAPES[entity]);

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
    ['LSMinimumSystemVersion', '26.0'],
    ...(app.appId ? [['AiaoAppId', app.appId] as const] : []),
    ...(app.runtime ? [['AiaoRuntime', app.runtime] as const] : [])
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

/** 从 Info.plist 里读出的、桌面关心的几个键；没有的键为 `undefined`。 */
export interface ParsedBundleInfo {
  readonly name?: string;
  readonly identifier?: string;
  readonly appId?: string;
  readonly runtime?: string;
}

/**
 * 读 Info.plist 里的字符串键值。只认 `<key>…</key><string>…</string>` 成对出现的写法（{@link infoPlist} 写出的就是
 * 这种），别的内容一律忽略——用户改坏或换了格式的 plist 只会读不到标识，不会读出别的东西。
 */
export function parseInfoPlist(xml: string): ParsedBundleInfo {
  const values = new Map<string, string>();
  for (const [, key, value] of xml.matchAll(/<key>([^<]+)<\/key>\s*<string>([^<]*)<\/string>/g))
    values.set(unescapeXml(key), unescapeXml(value));
  return {
    name: values.get('CFBundleName'),
    identifier: values.get('CFBundleIdentifier'),
    appId: values.get('AiaoAppId'),
    runtime: values.get('AiaoRuntime')
  };
}
