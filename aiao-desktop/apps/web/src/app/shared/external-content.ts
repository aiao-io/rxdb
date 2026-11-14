/**
 * 外网内容清单（ADESK-US-007、D-04）：桌面会向哪些第三方主机发请求、为什么、会发什么、什么时候发。
 *
 * 纯数据、不依赖 Angular：「关于本机 ▸ External Content」页由它渲染，web 单测拿它去对账 `src/` 里出现的每个外网主机。
 * 清单里的文案是界面文字，和桌面的其余界面一样用英文；主机名与源码里的 URL 逐字相同。
 */

/**
 * 触发方式。同一个主机在几处被用到、触发方式不一样时取最早的那种：`on-open` 先于 `on-action`，
 * 只要有一处不等用户操作就会请求，第三方就可能在用户什么都没做时看到 IP。
 */
export const EXTERNAL_TRIGGERS = {
  /** 打开桌面或打开应用就请求。 */
  'on-open': { label: 'On open', meaning: 'Requested as soon as the desktop or the app opens.' },
  /** 用户做了某个操作之后才请求。 */
  'on-action': {
    label: 'On action',
    meaning: 'Requested only after you do something, such as searching or entering an address.'
  }
} as const;

/** 触发方式的取值：`on-open` 打开就请求，`on-action` 用户操作后才请求。 */
export type ExternalTrigger = keyof typeof EXTERNAL_TRIGGERS;

/** Safari 阅读模式用的网页抽取服务；阅读模式入口处的提示用它渲染主机名，清单里的这一项也用它。 */
export const READER_HOST = 'r.jina.ai';

/** 清单里的一项：桌面会请求的一个第三方主机。 */
export interface ExternalContentEntry {
  /** 第三方主机，不含协议与路径；与源码里 URL 的主机逐字相同，单测据此对账。 */
  readonly host: string;
  /** 它提供什么内容、用在哪里。 */
  readonly purpose: string;
  /** 除 IP 地址与常规请求头之外，请求里还会带出去的数据。 */
  readonly sends: string;
  /** 打开就请求，还是用户操作后才请求。 */
  readonly trigger: ExternalTrigger;
  /** 具体在什么时候请求。 */
  readonly when: string;
  /** 用到它的应用（界面上的名字）。 */
  readonly apps: readonly string[];
}

/** 对清单里每一项都成立的事实，说明页开头统一写明；第一句是所有请求共有的：第三方至少看到用户的 IP。 */
export const EXTERNAL_CONTENT_NOTICE: readonly string[] = [
  'Every request below lets that host see your IP address and the usual browser details, such as the User-Agent. “Sends” lists only what goes out on top of that.',
  'The requests go straight from your browser to each host. The desktop has no server or account of its own in between.',
  'If a host can’t be reached, the desktop keeps working: that picture, map or forecast is simply missing.'
];

/**
 * 外网内容清单。新增外网主机要先登记在这里（或在 `LINK_ONLY_HOSTS`），否则 `external-content.spec.ts` 失败。
 * 顺序即页面上的顺序：先是打开桌面就请求的，再是各应用，用户操作后才请求的紧跟在对应应用之后。
 */
export const EXTERNAL_CONTENT: readonly ExternalContentEntry[] = [
  {
    host: 'fonts.googleapis.com',
    purpose: 'Google Fonts stylesheet for the Inter and JetBrains Mono typefaces.',
    sends: 'The font families and weights the desktop asks for.',
    trigger: 'on-open',
    when: 'Loads with the page, before anything else.',
    apps: ['Every app']
  },
  {
    host: 'fonts.gstatic.com',
    purpose: 'The font files that the Google Fonts stylesheet points to.',
    sends: 'Which font file is wanted.',
    trigger: 'on-open',
    when: 'Loads with the page, as soon as a typeface is needed.',
    apps: ['Every app']
  },
  {
    host: 'images.unsplash.com',
    purpose: 'Wallpaper photographs, and the thumbnails in System Settings ▸ Wallpaper.',
    sends: 'Which photo and what size, as part of the address (for example w=3200).',
    trigger: 'on-open',
    when: 'Loads the wallpaper you picked when the desktop opens, and again when you switch wallpaper.',
    apps: ['Desktop', 'System Settings']
  },
  {
    host: 'api.open-meteo.com',
    purpose: 'Current conditions and the seven-day forecast in the Weather widget and the Weather app.',
    sends:
      'The latitude and longitude of the first city in your Weather list (Cupertino by default). It is not your device location.',
    trigger: 'on-open',
    when: 'When the desktop opens. The Weather app reuses that reading, and asks again only if the first try failed.',
    apps: ['Desktop', 'Weather']
  },
  {
    host: 'upload.wikimedia.org',
    purpose:
      'Thumbnails of the Wikimedia Commons photographs in Photos, and of the pictures in Safari’s Wikipedia pages.',
    sends: 'Which picture and what thumbnail width, as part of the address.',
    trigger: 'on-open',
    when: 'Photos asks for the thumbnails near the visible area when it opens, and for more as you scroll.',
    apps: ['Photos', 'Safari']
  },
  {
    host: 'commons.wikimedia.org',
    purpose: 'Searching Wikimedia Commons for pictures to add to the Photos library.',
    sends: 'The words you search for.',
    trigger: 'on-action',
    when: 'When you press Return in the Photos search field, or choose “Search the web”.',
    apps: ['Photos']
  },
  {
    host: 'basemaps.cartocdn.com',
    purpose: 'Map tiles in Maps: CARTO’s Voyager and Dark Matter styles, drawn from OpenStreetMap data.',
    sends:
      'The position of each tile (zoom level, x and y) for the area you are looking at, the light or dark style, and whether your screen is high-density. Requests go to the a, b, c and d subdomains.',
    trigger: 'on-open',
    when: 'Maps asks for the visible tiles when it opens, and for more as you pan or zoom.',
    apps: ['Maps']
  },
  {
    host: 'nominatim.openstreetmap.org',
    purpose: 'Place search in Maps, through OpenStreetMap’s Nominatim geocoder.',
    sends: 'The search words you type in Maps.',
    trigger: 'on-action',
    when: 'When you press Return in the Maps search field.',
    apps: ['Maps']
  },
  {
    host: 'icons.duckduckgo.com',
    purpose: 'Website icons on Safari’s start page, sidebar, tabs and tab overview.',
    sends:
      'The host name of each site shown, such as en.wikipedia.org: your favourites, the sites you visit often and your open tabs.',
    trigger: 'on-open',
    when: 'Safari asks for the icons of its favourites when it opens, and for any new site you visit.',
    apps: ['Safari']
  },
  {
    host: READER_HOST,
    purpose: `Reader view in Safari. ${READER_HOST} fetches a page for you and sends back its text, so sites that refuse to be framed can still be read.`,
    sends: `The full address you enter in Safari, including its path and query. ${READER_HOST} fetches that page itself, so it also learns which page you read.`,
    trigger: 'on-action',
    when: 'When you enter an address that can’t be shown in a frame, or turn Reader on.',
    apps: ['Safari']
  },
  {
    host: 'en.wikipedia.org',
    purpose:
      'Wikipedia articles in Safari, and the results when you type words instead of a web address in Safari or use “Search the web” in Spotlight.',
    sends: 'The article title, or the words you typed.',
    trigger: 'on-action',
    when: 'When you open a Wikipedia address, or press Return after typing words in Safari.',
    apps: ['Safari', 'Spotlight']
  },
  {
    host: 'www.youtube.com',
    purpose: 'The embedded video player in Safari.',
    sends:
      'The video ID from the YouTube address you enter, and this desktop’s address as the referrer. The player is YouTube’s own page, so YouTube handles everything after that.',
    trigger: 'on-action',
    when: 'When you enter a YouTube watch link in Safari.',
    apps: ['Safari']
  },
  {
    host: 'vscode.aiao.io',
    purpose: 'Aiao Code, a code editor hosted as a separate site and shown inside its own window.',
    sends:
      'Only the page request, plus whether its window is in front or maximised, shared over Orbit. Whatever you do inside Aiao Code is handled by that site.',
    trigger: 'on-open',
    when: 'When you open Aiao Code.',
    apps: ['Aiao Code']
  }
];

/**
 * Safari 里由用户输入决定的站点：主机不固定，没法逐个登记，单独写明。
 * 能内嵌的少数站点（`safari-url.ts` 的 `framable`）由 iframe 直接加载，其余走阅读模式。
 */
export const SAFARI_ENTERED_SITES = `Safari also opens whatever address you enter or pick from its favourites. A few sites that allow embedding load directly in a frame, and every other address is read through ${READER_HOST}. Images inside a Reader article load from the article’s own servers. These hosts depend on what you type, so they are not listed one by one.`;

/** 只是链接、不发请求的主机：写在文字里或点击才在新窗口打开，桌面本身从不请求它。 */
export interface LinkOnlyHost {
  /** 主机，不含协议与路径。 */
  readonly host: string;
  /** 为什么它只是链接。 */
  readonly reason: string;
}

/**
 * 「只是链接」名单。出现在源码里、但桌面自己从不请求的外网主机：逐个确认过，点击链接才由浏览器在新标签页打开。
 */
export const LINK_ONLY_HOSTS: readonly LinkOnlyHost[] = [
  {
    host: 'developer.mozilla.org',
    reason:
      'A link in the sample note prasenx.txt. TextEdit makes it clickable; your browser opens it in a new tab only when you click.'
  },
  {
    host: 'vivari.run',
    reason: 'A link in the sample note prasenx.txt, handled the same way.'
  },
  {
    host: 'www.apple.com',
    reason:
      'The “Open apple.com” link on Safari’s built-in Apple page opens in a new tab only when you click. The same host also appears as the DTD identifier in generated .plist files, which is never fetched.'
  },
  {
    host: 'unsplash.com',
    reason:
      'A photographer credit written as plain text in the Photos library. It is not a link and nothing is requested.'
  }
];
