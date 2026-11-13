import { Type } from '@angular/core';

import {
  DesktopAppDefinition,
  DesktopAppManifest,
  DesktopAppRegistry,
  assertManifests
} from '../services/desktop-apps';
import { AboutApp } from './about/about';
import { ActivityMonitorApp } from './activity-monitor/activity-monitor';
import { DESKTOP_APP_MANIFESTS } from './app-manifests';
import { CalculatorApp } from './calculator/calculator';
import { CalendarApp } from './calendar/calendar';
import { ClockApp } from './clock/clock';
import { ContactsApp } from './contacts/contacts';
import { DiskUtilityApp } from './disk-utility/disk-utility';
import { FaceTimeApp } from './facetime/facetime';
import { FinderApp } from './finder/finder';
import { FontBookApp } from './font-book/font-book';
import { FreeformApp } from './freeform/freeform';
import { MailApp } from './mail/mail';
import { MapsApp } from './maps/maps';
import { MessagesApp } from './messages/messages';
import { MusicApp } from './music/music';
import { NotesApp } from './notes/notes';
import { PhotosApp } from './photos/photos';
import { PreviewApp } from './preview/preview';
import { RemindersApp } from './reminders/reminders';
import { SafariApp } from './safari/safari';
import { SaltlineApp } from './saltline/saltline';
import { SettingsApp } from './settings/settings';
import { ShelfApp } from './shelf/shelf';
import { StocksApp } from './stocks/stocks';
import { TerminalApp } from './terminal/terminal';
import { TextEditApp } from './textedit/textedit';
import { VoiceMemosApp } from './voice-memos/voice-memos';
import { WeatherApp } from './weather/weather';
import { WebAppWindow } from './web-app/web-app';

type Manifests = typeof DESKTOP_APP_MANIFESTS;
type BuiltinAppId = { [K in keyof Manifests]: Manifests[K]['kind'] extends 'builtin' ? K : never }[keyof Manifests];

/** 内置应用的组件：新增内置应用时漏绑组件编译不过。 */
const BUILTIN_COMPONENTS: Readonly<Record<BuiltinAppId, Type<unknown>>> = {
  finder: FinderApp,
  terminal: TerminalApp,
  calculator: CalculatorApp,
  about: AboutApp,
  textedit: TextEditApp,
  preview: PreviewApp,
  notes: NotesApp,
  calendar: CalendarApp,
  safari: SafariApp,
  music: MusicApp,
  settings: SettingsApp,
  mail: MailApp,
  messages: MessagesApp,
  maps: MapsApp,
  photos: PhotosApp,
  reminders: RemindersApp,
  weather: WeatherApp,
  stocks: StocksApp,
  clock: ClockApp,
  contacts: ContactsApp,
  freeform: FreeformApp,
  podcasts: ShelfApp,
  tv: ShelfApp,
  books: ShelfApp,
  appstore: ShelfApp,
  facetime: FaceTimeApp,
  activity: ActivityMonitorApp,
  diskutil: DiskUtilityApp,
  fontbook: FontBookApp,
  voice: VoiceMemosApp,
  saltline: SaltlineApp
};

/** 清单加组件：内置应用按 id 取组件，集成应用共用承载 Orbit 的窗口内容，系统入口没有组件。 */
function bind(app: DesktopAppManifest): DesktopAppDefinition {
  if (app.kind === 'system') return app;
  const component = app.kind === 'web' ? WebAppWindow : BUILTIN_COMPONENTS[app.id as BuiltinAppId];
  return { ...app, component };
}

/** 应用登记表（D-10）：顺序与清单一致，按 `.app` 文件名查找应用时依赖它。 */
export const DESKTOP_APP_REGISTRY = Object.fromEntries(
  Object.values(DESKTOP_APP_MANIFESTS).map(app => [app.id, bind(app)])
) as DesktopAppRegistry;

/** 桌面页提供登记表时先校验清单，不合规直接报错。 */
export function desktopAppRegistry(): DesktopAppRegistry {
  assertManifests(DESKTOP_APP_MANIFESTS);
  return DESKTOP_APP_REGISTRY;
}
