import { DesktopAppRegistry } from '../services/desktop-apps';
import { AboutApp } from './about/about';
import { ActivityMonitorApp } from './activity-monitor/activity-monitor';
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
import { SettingsApp } from './settings/settings';
import { ShelfApp } from './shelf/shelf';
import { StocksApp } from './stocks/stocks';
import { TerminalApp } from './terminal/terminal';
import { TextEditApp } from './textedit/textedit';
import { VoiceMemosApp } from './voice-memos/voice-memos';
import { WeatherApp } from './weather/weather';

const shelf = { w: 900, h: 600, minW: 520, minH: 340, component: ShelfApp } as const;

/** 应用登记表：顺序即原注册顺序，按 `.app` 文件名查找应用时依赖它。 */
export const DESKTOP_APP_REGISTRY: DesktopAppRegistry = {
  finder: {
    id: 'finder',
    name: 'Finder',
    icon: 'app-finder',
    w: 940,
    h: 600,
    minW: 560,
    minH: 340,
    single: false,
    component: FinderApp
  },
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    icon: 'app-terminal',
    w: 760,
    h: 470,
    minW: 420,
    minH: 220,
    single: false,
    component: TerminalApp
  },
  calculator: {
    id: 'calculator',
    name: 'Calculator',
    icon: 'app-calculator',
    w: 254,
    h: 366,
    minW: 232,
    minH: 320,
    component: CalculatorApp
  },
  about: { id: 'about', name: 'Finder', icon: 'app-finder', w: 400, h: 468, minW: 400, minH: 468, component: AboutApp },
  textedit: {
    id: 'textedit',
    name: 'TextEdit',
    icon: 'f-txt',
    w: 620,
    h: 520,
    minW: 340,
    minH: 240,
    single: false,
    component: TextEditApp
  },
  preview: {
    id: 'preview',
    name: 'Preview',
    icon: 'app-preview',
    w: 640,
    h: 560,
    minW: 360,
    minH: 300,
    single: false,
    component: PreviewApp
  },
  notes: { id: 'notes', name: 'Notes', icon: 'app-notes', w: 940, h: 600, minW: 580, minH: 340, component: NotesApp },
  calendar: {
    id: 'calendar',
    name: 'Calendar',
    icon: 'app-calendar',
    w: 880,
    h: 600,
    minW: 560,
    minH: 380,
    component: CalendarApp
  },
  safari: {
    id: 'safari',
    name: 'Safari',
    icon: 'app-safari',
    w: 1020,
    h: 660,
    minW: 520,
    minH: 360,
    single: false,
    component: SafariApp
  },
  music: { id: 'music', name: 'Music', icon: 'app-music', w: 1000, h: 640, minW: 620, minH: 400, component: MusicApp },
  settings: {
    id: 'settings',
    name: 'System Settings',
    icon: 'app-settings',
    w: 800,
    h: 600,
    minW: 620,
    minH: 420,
    component: SettingsApp
  },
  mail: { id: 'mail', name: 'Mail', icon: 'app-mail', w: 1020, h: 640, minW: 620, minH: 380, component: MailApp },
  messages: {
    id: 'messages',
    name: 'Messages',
    icon: 'app-messages',
    w: 900,
    h: 600,
    minW: 560,
    minH: 360,
    component: MessagesApp
  },
  maps: { id: 'maps', name: 'Maps', icon: 'app-maps', w: 940, h: 620, minW: 480, minH: 320, component: MapsApp },
  photos: {
    id: 'photos',
    name: 'Photos',
    icon: 'app-photos',
    w: 1060,
    h: 700,
    minW: 640,
    minH: 420,
    component: PhotosApp
  },
  reminders: {
    id: 'reminders',
    name: 'Reminders',
    icon: 'app-reminders',
    w: 760,
    h: 540,
    minW: 480,
    minH: 320,
    component: RemindersApp
  },
  weather: {
    id: 'weather',
    name: 'Weather',
    icon: 'app-weather',
    w: 460,
    h: 620,
    minW: 340,
    minH: 420,
    component: WeatherApp
  },
  stocks: {
    id: 'stocks',
    name: 'Stocks',
    icon: 'app-stocks',
    w: 800,
    h: 560,
    minW: 480,
    minH: 340,
    component: StocksApp
  },
  clock: { id: 'clock', name: 'Clock', icon: 'app-clock', w: 520, h: 420, minW: 360, minH: 300, component: ClockApp },
  contacts: {
    id: 'contacts',
    name: 'Contacts',
    icon: 'app-contacts',
    w: 760,
    h: 540,
    minW: 480,
    minH: 320,
    component: ContactsApp
  },
  freeform: {
    id: 'freeform',
    name: 'Freeform',
    icon: 'app-freeform',
    w: 860,
    h: 600,
    minW: 480,
    minH: 320,
    component: FreeformApp
  },
  podcasts: { id: 'podcasts', name: 'Podcasts', icon: 'app-podcasts', ...shelf },
  tv: { id: 'tv', name: 'TV', icon: 'app-tv', ...shelf },
  books: { id: 'books', name: 'Books', icon: 'app-books', ...shelf },
  appstore: { id: 'appstore', name: 'App Store', icon: 'app-appstore', ...shelf },
  facetime: {
    id: 'facetime',
    name: 'FaceTime',
    icon: 'app-facetime',
    w: 780,
    h: 560,
    minW: 440,
    minH: 320,
    component: FaceTimeApp
  },
  activity: {
    id: 'activity',
    name: 'Activity Monitor',
    icon: 'app-activity',
    w: 860,
    h: 560,
    minW: 560,
    minH: 340,
    component: ActivityMonitorApp
  },
  diskutil: {
    id: 'diskutil',
    name: 'Disk Utility',
    icon: 'app-diskutil',
    w: 800,
    h: 520,
    minW: 560,
    minH: 340,
    component: DiskUtilityApp
  },
  fontbook: {
    id: 'fontbook',
    name: 'Font Book',
    icon: 'app-fontbook',
    w: 820,
    h: 560,
    minW: 540,
    minH: 340,
    component: FontBookApp
  },
  voice: {
    id: 'voice',
    name: 'Voice Memos',
    icon: 'app-voice',
    w: 720,
    h: 500,
    minW: 460,
    minH: 320,
    component: VoiceMemosApp
  },
  launchpad: { id: 'launchpad', name: 'Launchpad', icon: 'app-launchpad' },
  trash: { id: 'trash', name: 'Trash', icon: 'app-trash' }
};
