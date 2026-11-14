import {
  AppLoader,
  DesktopAppDefinition,
  DesktopAppManifest,
  DesktopAppRegistry,
  assertManifests
} from '../services/desktop-apps';
import { DESKTOP_APP_MANIFESTS } from './app-manifests';
import { FinderApp } from './finder/finder';

type Manifests = typeof DESKTOP_APP_MANIFESTS;
type BuiltinAppId = { [K in keyof Manifests]: Manifests[K]['kind'] extends 'builtin' ? K : never }[keyof Manifests];

/**
 * 内置应用的装载函数（D-18）：每个应用一次动态导入，窗口真正打开时才下载它的 chunk。
 * 只有 Finder 随壳层静态装载——桌面启动后会自动打开一个 Finder 窗口，它与磁盘服务本来就在首屏里。
 * 新增内置应用时漏登记装载函数编译不过。
 */
const BUILTIN_LOADERS: Readonly<Record<BuiltinAppId, AppLoader>> = {
  finder: async () => FinderApp,
  terminal: () => import('./terminal/terminal').then(m => m.TerminalApp),
  calculator: () => import('./calculator/calculator').then(m => m.CalculatorApp),
  about: () => import('./about/about').then(m => m.AboutApp),
  textedit: () => import('./textedit/textedit').then(m => m.TextEditApp),
  preview: () => import('./preview/preview').then(m => m.PreviewApp),
  notes: () => import('./notes/notes').then(m => m.NotesApp),
  calendar: () => import('./calendar/calendar').then(m => m.CalendarApp),
  safari: () => import('./safari/safari').then(m => m.SafariApp),
  music: () => import('./music/music').then(m => m.MusicApp),
  settings: () => import('./settings/settings').then(m => m.SettingsApp),
  mail: () => import('./mail/mail').then(m => m.MailApp),
  messages: () => import('./messages/messages').then(m => m.MessagesApp),
  maps: () => import('./maps/maps').then(m => m.MapsApp),
  photos: () => import('./photos/photos').then(m => m.PhotosApp),
  reminders: () => import('./reminders/reminders').then(m => m.RemindersApp),
  weather: () => import('./weather/weather').then(m => m.WeatherApp),
  stocks: () => import('./stocks/stocks').then(m => m.StocksApp),
  clock: () => import('./clock/clock').then(m => m.ClockApp),
  contacts: () => import('./contacts/contacts').then(m => m.ContactsApp),
  freeform: () => import('./freeform/freeform').then(m => m.FreeformApp),
  podcasts: () => import('./shelf/shelf').then(m => m.ShelfApp),
  tv: () => import('./shelf/shelf').then(m => m.ShelfApp),
  books: () => import('./shelf/shelf').then(m => m.ShelfApp),
  appstore: () => import('./shelf/shelf').then(m => m.ShelfApp),
  facetime: () => import('./facetime/facetime').then(m => m.FaceTimeApp),
  activity: () => import('./activity-monitor/activity-monitor').then(m => m.ActivityMonitorApp),
  diskutil: () => import('./disk-utility/disk-utility').then(m => m.DiskUtilityApp),
  fontbook: () => import('./font-book/font-book').then(m => m.FontBookApp),
  voice: () => import('./voice-memos/voice-memos').then(m => m.VoiceMemosApp),
  saltline: () => import('./saltline/saltline').then(m => m.SaltlineApp)
};

/** 集成应用共用承载 Orbit 的窗口内容，打开集成应用的窗口时才装载（桌面启动不请求远程入口，也不下载 Orbit 的窗口组件）。 */
const WEB_APP_LOADER: AppLoader = () => import('./web-app/web-app').then(m => m.WebAppWindow);

/** 清单加装载函数：内置应用按 id 取，集成应用共用一个，系统入口没有。 */
function bind(app: DesktopAppManifest): DesktopAppDefinition {
  if (app.kind === 'system') return app;
  return { ...app, load: app.kind === 'web' ? WEB_APP_LOADER : BUILTIN_LOADERS[app.id as BuiltinAppId] };
}

/** 应用登记表（D-10）：顺序与清单一致。 */
export const DESKTOP_APP_REGISTRY = Object.fromEntries(
  Object.values(DESKTOP_APP_MANIFESTS).map(app => [app.id, bind(app)])
) as DesktopAppRegistry;

/** 桌面页提供登记表时先校验清单，不合规直接报错。 */
export function desktopAppRegistry(): DesktopAppRegistry {
  assertManifests(DESKTOP_APP_MANIFESTS);
  return DESKTOP_APP_REGISTRY;
}
