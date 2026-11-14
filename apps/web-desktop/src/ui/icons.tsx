import { MacosIcon, type MacosAppSymbol, type MacosFileSymbol, type MacosGlyphSymbol } from './macos-sprite.js';

const macAppSymbols: Record<string, MacosAppSymbol> = {
  files: 'app-finder',
  launcher: 'app-launchpad',
  safari: 'app-safari',
  mail: 'app-mail',
  messages: 'app-messages',
  maps: 'app-maps',
  photos: 'app-photos',
  notes: 'app-notes',
  calendar: 'app-calendar',
  music: 'app-music',
  terminal: 'app-terminal',
  calculator: 'app-calculator',
  settings: 'app-settings',
  trash: 'app-trash'
};

function CalendarAppIcon() {
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  return (
    <span className='app-icon icon-calendar calendar-app-icon' aria-hidden='true'>
      <span className='calendar-sprite'>
        <MacosIcon symbol='app-calendar' />
      </span>
      <span className='calendar-day-name' data-label={weekday} />
      <span className='calendar-day-number' data-label={now.getDate()} />
    </span>
  );
}

export function AppIcon({ id }: { id: string }) {
  const macSymbol = macAppSymbols[id];
  if (macSymbol === 'app-calendar') return <CalendarAppIcon />;
  if (macSymbol) {
    return (
      <span className={`app-icon icon-${id}`} aria-hidden='true'>
        <MacosIcon symbol={macSymbol} />
      </span>
    );
  }
  return (
    <span className={`app-icon icon-${id}`} aria-hidden='true'>
      <svg viewBox='0 0 64 64' fill='none'>
        {id === 'files' ?
          <>
            <g className='finder-art'>
              <rect x='5' y='5' width='54' height='54' rx='12' fill='#d5ecff' />
              <path d='M17 5h18l-7 27h7v27H17A12 12 0 0 1 5 47V17A12 12 0 0 1 17 5Z' fill='#1689f9' />
              <path d='m35 5-7 27h7v15' stroke='#245286' strokeWidth='1.6' />
              <path d='M17 39q15 13 30-1' stroke='#173658' strokeWidth='2.4' strokeLinecap='round' />
              <path d='M19 22v5m26-5v5' stroke='#173658' strokeWidth='2.5' strokeLinecap='round' />
            </g>
            <g className='explorer-art'>
              <path d='M4 15a5 5 0 0 1 5-5h17l6 7h23a5 5 0 0 1 5 5v29H4Z' fill='#e5a328' />
              <path d='M4 22h56v27a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6Z' fill='#ffd663' />
              <path d='M4 27h56v7H4Z' fill='#ffe59a' />
              <path d='M23 38h18v17H23Z' fill='#4b9ef2' />
              <path d='M27 38h10v17H27Z' fill='#75baff' />
            </g>
          </>
        : id === 'editor' ?
          <>
            <rect x='8' y='5' width='48' height='54' rx='10' fill='#f9fbff' />
            <path d='M9 16h46v8H9Z' fill='#e8edf2' />
            <path d='M17 31h25M17 38h22M17 45h17' stroke='#9ba6b7' strokeWidth='2.5' strokeLinecap='round' />
            <path d='m35 45 15-26 7 4-15 26-9 6Z' fill='#f1b445' />
            <path d='m33 55 2-10 7 4Z' fill='#556277' />
          </>
        : id === 'notes' ?
          <>
            <rect x='7' y='5' width='50' height='54' rx='11' fill='#f8d34f' />
            <path d='M9 15h46v38a6 6 0 0 1-6 6H15a6 6 0 0 1-6-6Z' fill='#fffdf5' />
            <path d='M9 15h46v9H9Z' fill='#ffd85c' />
            <path d='M18 32h24M18 39h24M18 46h17' stroke='#b4a56f' strokeWidth='2.3' strokeLinecap='round' />
            <path d='M18 11h28' stroke='#e2b82f' strokeWidth='3' strokeLinecap='round' />
          </>
        : id === 'settings' ?
          <>
            <rect x='5' y='5' width='54' height='54' rx='12' fill='#b9c0ca' />
            <path d='m27 12 10 0 2 7 7-1 5 9-5 5 5 5-5 9-7-1-2 7H27l-2-7-7 1-5-9 5-5-5-5 5-9 7 1Z' fill='#697485' />
            <circle cx='32' cy='32' r='13' fill='#d6dce4' stroke='#f4f6f9' strokeWidth='2' />
            <circle cx='32' cy='32' r='8' fill='#637084' />
          </>
        : id === 'launcher' ?
          <>
            <rect x='5' y='5' width='54' height='54' rx='12' fill='#ededf2' />
            <path d='M17 6h30a11 11 0 0 1 11 11' stroke='white' strokeOpacity='.85' />
            {Array.from({ length: 9 }, (_, index) => (
              <rect
                key={index}
                x={16 + (index % 3) * 12}
                y={16 + Math.floor(index / 3) * 12}
                width='8'
                height='8'
                rx='2.5'
                fill='#777b85'
              />
            ))}
          </>
        : id === 'overview' ?
          <>
            <rect x='5' y='9' width='54' height='43' rx='7' fill='#333b4b' />
            <rect x='9' y='13' width='46' height='35' rx='3' fill='#439eeb' />
            <path d='M9 16a3 3 0 0 1 3-3h40a3 3 0 0 1 3 3v13H9Z' fill='#7ec4ff' />
            <rect x='14' y='21' width='19' height='20' rx='2' fill='#ffffff40' stroke='white' strokeWidth='1.5' />
            <rect x='38' y='21' width='10' height='20' rx='2' fill='#ffffff40' stroke='white' strokeWidth='1.5' />
            <path d='M23 56h18' stroke='#c7ccd6' strokeWidth='4' strokeLinecap='round' />
          </>
        : id === 'safari' ?
          <>
            <rect x='4' y='4' width='56' height='56' rx='15' fill='#f4f7fb' />
            <circle cx='32' cy='32' r='23' fill='#168cf0' />
            <circle cx='32' cy='32' r='19' fill='none' stroke='#d8f4ff' strokeWidth='1.4' />
            <path d='m45 19-10 17-16 9 10-17Z' fill='#ff453a' />
            <path d='m45 19-10 17-16 9 17-10Z' fill='#fff' opacity='.94' />
            <circle cx='32' cy='32' r='2' fill='#fff' />
          </>
        : id === 'mail' ?
          <>
            <rect x='4' y='4' width='56' height='56' rx='15' fill='#1288f9' />
            <rect x='13' y='19' width='38' height='27' rx='5' fill='#fff' />
            <path d='m14 21 18 13 18-13' fill='none' stroke='#1687ef' strokeWidth='3.2' strokeLinecap='round' />
          </>
        : id === 'messages' ?
          <>
            <rect x='4' y='4' width='56' height='56' rx='15' fill='#28d447' />
            <path
              d='M32 15c-12.8 0-23 7.8-23 17.5 0 5.5 3.1 10.3 8.1 13.4.2 3-1 5.7-3.1 7.6 4.2-.6 7.8-2.1 10.4-4.3 2.4.5 4.9.8 7.6.8 12.8 0 23-7.8 23-17.5S44.8 15 32 15Z'
              fill='#fff'
            />
          </>
        : id === 'maps' ?
          <>
            <rect x='4' y='4' width='56' height='56' rx='15' fill='#dff2df' />
            <path d='M4 19 20 4h18L4 38Z' fill='#86cef1' />
            <path d='M34 4h26v18L34 31Z' fill='#a3d99c' />
            <path d='M4 42 25 35l35 8v13H4Z' fill='#f8f7ee' />
            <path d='M11 5 19 59M55 4 35 60' stroke='#ffd45e' strokeWidth='5' />
            <path
              d='M42 15c-6.5 0-11 5.1-11 11.1 0 7.3 11 18.4 11 18.4s11-11.1 11-18.4C53 20.1 48.5 15 42 15Z'
              fill='#f43f3f'
            />
            <circle cx='42' cy='26' r='4' fill='#fff' />
          </>
        : id === 'photos' ?
          <>
            <rect x='4' y='4' width='56' height='56' rx='15' fill='#fff' />
            {Array.from({ length: 8 }, (_, index) => (
              <ellipse
                key={index}
                cx='32'
                cy='25'
                rx='6.5'
                ry='15'
                fill={['#ffd400', '#ff9500', '#ff3b30', '#ff2d95', '#af52de', '#0a84ff', '#00c7be', '#34c759'][index]}
                transform={`rotate(${index * 45} 32 32)`}
              />
            ))}
            <circle cx='32' cy='32' r='7' fill='#fff' />
          </>
        : id === 'calendar' ?
          <>
            <rect x='4' y='4' width='56' height='56' rx='15' fill='#fff' />
            <rect x='4' y='4' width='56' height='20' rx='15' fill='#ff3b30' />
            <path d='M4 19h56v5H4Z' fill='#ff3b30' />
            <path d='M27 35v18M35 35v18' stroke='#1d1d1f' strokeWidth='3' strokeLinecap='round' />
            <path d='M27 35h4v18M35 35h4v18' fill='none' stroke='#1d1d1f' strokeWidth='1.2' />
            <path d='M17 12h30' stroke='#fff' strokeWidth='2.5' strokeLinecap='round' />
          </>
        : id === 'music' ?
          <>
            <rect x='4' y='4' width='56' height='56' rx='15' fill='#f43f5e' />
            <path
              d='M43 14 25 18a3 3 0 0 0-2.5 3v20a7 7 0 0 0-3-.7c-4.2 0-7.5 2.7-7.5 6s3.3 6 7.5 6 7.5-2.7 7.5-6V27l16-3v13.5a7 7 0 0 0-3-.7c-4.2 0-7.5 2.7-7.5 6s3.3 6 7.5 6 7.5-2.7 7.5-6V17a3 3 0 0 0-3.5-3Z'
              fill='#fff'
            />
          </>
        : id === 'terminal' ?
          <>
            <rect x='4' y='4' width='56' height='56' rx='15' fill='#17171a' />
            <path
              d='m18 24 10 8-10 8'
              fill='none'
              stroke='#fff'
              strokeWidth='3.5'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
            <rect x='32' y='37' width='14' height='3.5' rx='1.75' fill='#fff' />
          </>
        : id === 'calculator' ?
          <>
            <rect x='4' y='4' width='56' height='56' rx='15' fill='#38383b' />
            <rect x='12' y='12' width='40' height='12' rx='3' fill='#111113' />
            {Array.from({ length: 8 }, (_, index) => (
              <rect
                key={index}
                x={12 + (index % 3) * 10}
                y={29 + Math.floor(index / 3) * 9}
                width={index === 7 ? 20 : 8}
                height='6'
                rx='2'
                fill={index % 4 === 3 ? '#ff9f0a' : '#e9e9ec'}
              />
            ))}
          </>
        : id === 'trash' ?
          <>
            <path
              d='M18 22h28l-3 31a4 4 0 0 1-4 3H25a4 4 0 0 1-4-3Z'
              fill='#dfe4eb'
              stroke='#7b8797'
              strokeWidth='1.5'
            />
            <path d='M17 21h30M27 17h10' stroke='#7b8797' strokeWidth='2.2' strokeLinecap='round' />
            <path d='M26 27v22M32 27v22M38 27v22' stroke='#9aa4b2' strokeWidth='1.2' />
            <ellipse cx='32' cy='21' rx='15' ry='4' fill='#f3f5f8' stroke='#7b8797' strokeWidth='1.3' />
          </>
        : id === 'vscode' ?
          <>
            <rect x='5' y='5' width='54' height='54' rx='12' fill='#1678c8' />
            <path d='m17 20 12 10 15-13 6 4v26l-6 4-15-13-12 10-6-4 12-13-12-11Z' fill='#fff' />
            <path d='m44 17 6 4v26l-6 4Z' fill='#74bfff' />
          </>
        : id === 'catalog' ?
          <>
            <rect x='5' y='5' width='54' height='54' rx='12' fill='#1288f9' />
            <path d='m23 15 24 34M39 15 16 49M13 38h38' stroke='white' strokeWidth='5' strokeLinecap='round' />
          </>
        : <>
            <rect x='5' y='5' width='54' height='54' rx='12' fill='#868af2' />
            <path d='m32 15 17 17-17 17-17-17Z' stroke='white' strokeWidth='3' />
          </>
        }
      </svg>
    </span>
  );
}

const paths = {
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  list: 'M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01',
  folder: 'M3 7V5a2 2 0 0 1 2-2h5l3 4h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2ZM3 8h18',
  file: 'M14 2H5v20h14V7ZM14 2v6h5M8 12h8M8 16h6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  refresh: 'M20 7v-5m0 5h-5M20 7a9 9 0 1 0 1 9',
  bluetooth: 'M12 2v20l6-6-6-6 6-6-6-2M12 12 6 6M12 12 6 18',
  wifi: 'M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8 16a6 6 0 0 1 8 0M12 20h.01',
  volume: 'M11 4 5 9H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16',
  bell: 'M18 8a6 6 0 0 0-12 0c0 9-3 9-3 10h18c0-1-3-1-3-10M10 22h4',
  overview: 'M2 4h13v16H2ZM19 4h3v16h-3',
  controls: 'M3 6h18M3 18h18M7 3v6M17 15v6',
  switch: 'M3 7h18l-4-4M21 17H3l4 4',
  chevron: 'm9 5 7 7-7 7',
  drive: 'M5 3h14l3 12v6H2v-6ZM2 15h20M6 18h.01M10 18h.01',
  upload: 'M12 16V2m-5 5 5-5 5 5M3 15v7h18v-7',
  user: 'M20 21v-2a8 8 0 0 0-16 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0'
};
export function SymbolIcon({ name, className = '' }: { name: keyof typeof paths; className?: string }) {
  return (
    <svg
      className={`symbol-icon ${className}`}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.6'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function SystemMark({ mode }: { mode: 'macos' | 'windows' }) {
  return mode === 'windows' ?
      <svg className='system-mark windows-mark' viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
        <path d='M1 1h10v10H1Zm12 0h10v10H13ZM1 13h10v10H1Zm12 0h10v10H13Z' />
      </svg>
    : <MacosIcon symbol='g-apple' className='system-mark' />;
}

export function FileIcon({ kind, symbol }: { kind: 'file' | 'directory'; symbol?: MacosFileSymbol }) {
  const fileSymbol = symbol ?? (kind === 'directory' ? 'f-folder' : 'f-txt');
  return (
    <span className={`file-symbol ${kind}`} aria-hidden='true'>
      <MacosIcon symbol={fileSymbol} className='file-art' />
    </span>
  );
}

export function MacGlyph({ symbol, className = '' }: { symbol: MacosGlyphSymbol; className?: string }) {
  return <MacosIcon symbol={symbol} className={`mac-glyph ${className}`} />;
}
