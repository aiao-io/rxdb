export function AppIcon({ id }: { id: string }) {
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
        : id === 'editor' || id === 'notes' ?
          <>
            <rect x='8' y='5' width='48' height='54' rx='10' fill='#f9fbff' />
            <path d='M9 16h46v8H9Z' fill='#e8edf2' />
            <path d='M17 31h25M17 38h22M17 45h17' stroke='#9ba6b7' strokeWidth='2.5' strokeLinecap='round' />
            <path d='m35 45 15-26 7 4-15 26-9 6Z' fill='#f1b445' />
            <path d='m33 55 2-10 7 4Z' fill='#556277' />
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
    : <svg className='system-mark' viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
        <path d='M16.3 1.5c.2 2-1.4 4.2-3.5 4.4-.3-2 1.5-4.2 3.5-4.4ZM19.7 17.8c-.9 1.8-2 3.9-3.8 4-1.4.1-1.8-.9-3.5-.9s-2.2.9-3.5.9c-1.7-.1-3-2.3-4-4.2-2-3.9-1.6-8.5 1.5-10.2 1.6-.9 3.3-.3 4.4.1 1 .4 1.3.4 2.3 0 1.3-.5 3.4-1.1 5.2.6-4.4 2.6-3.5 7.9 1.4 9.7Z' />
      </svg>;
}

export function FileIcon({ kind }: { kind: 'file' | 'directory' }) {
  return (
    <span className={`file-symbol ${kind}`} aria-hidden='true'>
      <svg className='file-art' viewBox='0 0 64 64' fill='none'>
        {kind === 'directory' ?
          <>
            <path d='M4 17a5 5 0 0 1 5-5h16l6 6h24a5 5 0 0 1 5 5v28H4Z' fill='var(--folder-back)' />
            <path d='M4 23h56v25a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6Z' fill='var(--folder-front)' />
            <path d='M5 24h54' stroke='white' strokeOpacity='.5' />
            <path d='M10 53h44' stroke='black' strokeOpacity='.08' />
          </>
        : <>
            <path
              d='M15 5h24l12 13v41H15a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z'
              fill='#fff'
              stroke='#b2bccb'
              strokeWidth='1.3'
            />
            <path d='M39 5v14h12' fill='#e9edf3' />
            <path
              d='M39 5v14h12M20 29h22M20 36h22M20 43h18M20 50h12'
              stroke='#8e9bad'
              strokeWidth='1.6'
              strokeLinecap='round'
            />
          </>
        }
      </svg>
    </span>
  );
}
