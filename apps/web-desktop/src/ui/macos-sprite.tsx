export type MacosAppSymbol =
  | 'app-finder'
  | 'app-launchpad'
  | 'app-safari'
  | 'app-mail'
  | 'app-messages'
  | 'app-maps'
  | 'app-photos'
  | 'app-notes'
  | 'app-calendar'
  | 'app-music'
  | 'app-terminal'
  | 'app-calculator'
  | 'app-settings'
  | 'app-trash';

export type MacosFileSymbol = 'f-folder' | 'f-hd' | 'f-txt' | 'f-pdf' | 'f-img';
export type MacosGlyphSymbol = 'g-apple' | 'g-bt' | 'g-vol' | 'g-wifi' | 'g-search' | 'g-cc';

const glyphViewBoxes: Record<MacosGlyphSymbol, string> = {
  'g-apple': '0 0 15 18',
  'g-bt': '0 0 12 18',
  'g-vol': '0 0 18 14',
  'g-wifi': '0 0 18 14',
  'g-search': '0 0 16 16',
  'g-cc': '0 0 16 16'
};

const spriteMarkup = String.raw`<clipPath id="sqc"><rect x="0" y="0" width="100" height="100" rx="22" /></clipPath>
<symbol id="app-finder" viewBox="0 0 100 100">
  <linearGradient id="fiL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fdfefe"/><stop offset="1" stop-color="#dae2ec"/></linearGradient>
  <linearGradient id="fiR" x1=".1" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#41a7fb"/><stop offset=".55" stop-color="#2287f2"/><stop offset="1" stop-color="#0e64d8"/></linearGradient>
  <clipPath id="fiClipL"><rect x="0" y="0" width="42.5" height="100"/></clipPath>
  <clipPath id="fiClipR"><rect x="42.5" y="0" width="57.5" height="100"/></clipPath>
  <g clip-path="url(#sqc)">
    <rect width="100" height="100" fill="url(#fiL)"/>
    <rect x="42.5" width="57.5" height="100" fill="url(#fiR)"/>
    <g clip-path="url(#fiClipL)" fill="none" stroke="#1c6fd0" stroke-width="5.4" stroke-linecap="round">
      <path d="M29.5 30.5v13.5"/>
      <path d="M23 60.5c5.5 8.2 15 12.6 27 12.6s21.5-4.4 27-12.6"/>
    </g>
    <g clip-path="url(#fiClipR)" fill="none" stroke="#fff" stroke-width="5.4" stroke-linecap="round">
      <path d="M63.5 30.5v13.5"/>
      <path d="M23 60.5c5.5 8.2 15 12.6 27 12.6s21.5-4.4 27-12.6"/>
    </g>
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,.09)" stroke-width="1.4"/>
    <path d="M0 0h100v34H0z" fill="url(#fiGl)" opacity=".22"/>
    <linearGradient id="fiGl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </g>
</symbol>
<symbol id="app-launchpad" viewBox="0 0 100 100">
  <linearGradient id="lpB" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#fbfbfd"/><stop offset="1" stop-color="#dcdce1"/></linearGradient>
  <g clip-path="url(#sqc)">
    <rect width="100" height="100" fill="url(#lpB)"/>
    <g fill="#6f7076">
      <rect x="20" y="20" width="17" height="17" rx="5"/><rect x="41.5" y="20" width="17" height="17" rx="5"/><rect x="63" y="20" width="17" height="17" rx="5"/>
      <rect x="20" y="41.5" width="17" height="17" rx="5"/><rect x="41.5" y="41.5" width="17" height="17" rx="5"/><rect x="63" y="41.5" width="17" height="17" rx="5"/>
      <rect x="20" y="63" width="17" height="17" rx="5"/><rect x="41.5" y="63" width="17" height="17" rx="5"/><rect x="63" y="63" width="17" height="17" rx="5"/>
    </g>
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="1.4"/>
  </g>
</symbol>
<symbol id="app-safari" viewBox="0 0 100 100">
  <linearGradient id="sfB" x1="0" y1="0" x2=".2" y2="1"><stop offset="0" stop-color="#fcfdfe"/><stop offset="1" stop-color="#d5dae1"/></linearGradient>
  <linearGradient id="sfD" x1=".15" y1="0" x2=".85" y2="1"><stop offset="0" stop-color="#2ec7fb"/><stop offset=".5" stop-color="#1a8ef0"/><stop offset="1" stop-color="#0e5fd8"/></linearGradient>
  <g clip-path="url(#sqc)">
    <rect width="100" height="100" fill="url(#sfB)"/>
    <circle cx="50" cy="50" r="42.5" fill="url(#sfD)"/>
    <circle cx="50" cy="50" r="42.5" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1.6"/>
    
    <circle cx="50" cy="50" r="38.2" fill="none" stroke="rgba(255,255,255,.52)" stroke-width="3.6"
            stroke-dasharray="1.05 2.95" stroke-dashoffset="0.52"/>
    <circle cx="50" cy="50" r="37.2" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="5.6"
            stroke-dasharray="1.7 17.78" stroke-dashoffset="0.85"/>
    <g font-family="Inter,-apple-system,sans-serif" font-size="8.4" font-weight="700" fill="#fff" text-anchor="middle" opacity=".96">
      <text x="50" y="21">N</text><text x="50" y="85.6">S</text>
      <text x="83" y="53.1">E</text><text x="17" y="53.1">W</text>
    </g>
    
    <g transform="translate(.8 .8)" opacity=".22">
      <path d="M75 25 54.4 54.4 45.6 45.6z" fill="#000"/><path d="M25 75 45.6 45.6 54.4 54.4z" fill="#000"/>
    </g>
    <path d="M75 25 54.4 54.4 45.6 45.6z" fill="#ee453b"/>
    <path d="M25 75 45.6 45.6 54.4 54.4z" fill="#fbfcfd"/>
    <path d="M24 76 48.8 51.2 51.2 48.8z" fill="#fbfcfd"/>
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="1.4"/>
  </g>
</symbol>
<symbol id="app-mail" viewBox="0 0 100 100">
  <linearGradient id="mlB" x1=".1" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#3ec1fd"/><stop offset=".55" stop-color="#1d8bf5"/><stop offset="1" stop-color="#0a5fdb"/></linearGradient>
  <g clip-path="url(#sqc)">
    <rect width="100" height="100" fill="url(#mlB)"/>
    <path d="M22 34.5h56a5.5 5.5 0 0 1 5.5 5.5v20a5.5 5.5 0 0 1-5.5 5.5H22a5.5 5.5 0 0 1-5.5-5.5V40a5.5 5.5 0 0 1 5.5-5.5z" fill="#fff"/>
    <path d="M18.5 38 50 58.5 81.5 38" fill="none" stroke="#1d8bf5" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="1.4"/>
  </g>
</symbol>
<symbol id="app-messages" viewBox="0 0 100 100">
  <linearGradient id="msB" x1=".1" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#6ff26b"/><stop offset=".5" stop-color="#33dd4a"/><stop offset="1" stop-color="#08bd2e"/></linearGradient>
  <g clip-path="url(#sqc)">
    <rect width="100" height="100" fill="url(#msB)"/>
    <path d="M50 21c-18.2 0-33 11.6-33 26 0 8.2 4.8 15.5 12.3 20.3.5 4.4-1.4 8.7-4.6 11.6-.9.8-.3 2.3.9 2.1 7-1 12.4-3.8 16-6.4 2.7.6 5.5.9 8.4.9 18.2 0 33-11.6 33-26S68.2 21 50 21z" fill="#fff"/>
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="1.4"/>
  </g>
</symbol>
<symbol id="app-maps" viewBox="0 0 100 100">
  <linearGradient id="mpB" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#eaf6e4"/><stop offset="1" stop-color="#d3ecd8"/></linearGradient>
  <g clip-path="url(#sqc)">
    <rect width="100" height="100" fill="url(#mpB)"/>
    <path d="M0 0h34L0 44z" fill="#8fd3f4"/>
    <path d="M62 0h38v30z" fill="#a8dfa0" opacity=".7"/>
    <g stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"><path d="M-4 62 46 74l58-8"/></g>
    <g stroke="#ffd45e" stroke-width="6.5" fill="none" stroke-linecap="round"><path d="M18 -4 30 40l-6 60"/></g>
    <g stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"><path d="M104 26 60 34 44 96"/><path d="M-4 34h30"/></g>
    <path d="M68 24a11.4 11.4 0 0 0-11.4 11.4c0 8.4 11.4 21 11.4 21s11.4-12.6 11.4-21A11.4 11.4 0 0 0 68 24z" fill="#f43f3f"/>
    <circle cx="68" cy="35.4" r="4.2" fill="#fff"/>
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="1.4"/>
  </g>
</symbol>
<symbol id="app-photos" viewBox="0 0 100 100">
  <g clip-path="url(#sqc)">
    <rect width="100" height="100" fill="#fdfdfd"/>
    <g style="mix-blend-mode:multiply" opacity=".92">
      <ellipse cx="50" cy="34.5" rx="10.4" ry="17.5" fill="#ffd400"/>
      <ellipse cx="50" cy="34.5" rx="10.4" ry="17.5" fill="#ff9500" transform="rotate(45 50 50)"/>
      <ellipse cx="50" cy="34.5" rx="10.4" ry="17.5" fill="#ff3b30" transform="rotate(90 50 50)"/>
      <ellipse cx="50" cy="34.5" rx="10.4" ry="17.5" fill="#ff2d95" transform="rotate(135 50 50)"/>
      <ellipse cx="50" cy="34.5" rx="10.4" ry="17.5" fill="#af52de" transform="rotate(180 50 50)"/>
      <ellipse cx="50" cy="34.5" rx="10.4" ry="17.5" fill="#0a84ff" transform="rotate(225 50 50)"/>
      <ellipse cx="50" cy="34.5" rx="10.4" ry="17.5" fill="#00c7be" transform="rotate(270 50 50)"/>
      <ellipse cx="50" cy="34.5" rx="10.4" ry="17.5" fill="#34c759" transform="rotate(315 50 50)"/>
    </g>
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="1.4"/>
  </g>
</symbol>
<symbol id="app-notes" viewBox="0 0 100 100">
  <linearGradient id="ntY" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd84d"/><stop offset="1" stop-color="#f9bd20"/></linearGradient>
  <linearGradient id="ntP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffefb"/><stop offset="1" stop-color="#f4f2ea"/></linearGradient>
  <g clip-path="url(#sqc)">
    <rect width="100" height="100" fill="url(#ntP)"/>
    <rect width="100" height="24" fill="url(#ntY)"/>
    <g stroke="#dcd8cb" stroke-width="1.7" stroke-linecap="round">
      <path d="M17 38h66"/><path d="M17 50h66"/><path d="M17 62h66"/><path d="M17 74h48"/>
    </g>
    <rect y="24" width="100" height="1.6" fill="rgba(0,0,0,.07)"/>
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="1.4"/>
  </g>
</symbol>
<symbol id="app-calendar" viewBox="0 0 100 100">
  <g clip-path="url(#sqc)">
    <rect width="100" height="100" fill="#fff"/><rect width="100" height="100" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="1.4"/>
  </g>
</symbol>
<symbol id="app-music" viewBox="0 0 100 100">
  <linearGradient id="muB" x1=".1" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#fd6d7f"/><stop offset=".5" stop-color="#fb3f5e"/><stop offset="1" stop-color="#e51c40"/></linearGradient>
  <g clip-path="url(#sqc)">
    <rect width="100" height="100" fill="url(#muB)"/>
    <path fill="#fff" d="M70.5 20.3 42.8 26a3.4 3.4 0 0 0-2.7 3.3v31.9a10.4 10.4 0 0 0-4.6-1c-6 0-11 4.1-11 9.3s5 9.3 11 9.3 11-4.1 11-9.3V38.6l24.4-5v20.2a10.4 10.4 0 0 0-4.6-1c-6 0-11 4.1-11 9.3s5 9.3 11 9.3 11-4.1 11-9.3V23.6a3.4 3.4 0 0 0-4.2-3.3z"/>
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="1.4"/>
  </g>
</symbol>
<symbol id="app-terminal" viewBox="0 0 100 100">
  <linearGradient id="tmB" x1="0" y1="0" x2=".2" y2="1"><stop offset="0" stop-color="#3a3a3d"/><stop offset=".45" stop-color="#1e1e21"/><stop offset="1" stop-color="#0b0b0d"/></linearGradient>
  <g clip-path="url(#sqc)">
    <rect width="100" height="100" fill="url(#tmB)"/>
    <path d="M0 0h100v30H0z" fill="#fff" opacity=".05"/>
    <path d="M24 34 38 46 24 58" fill="none" stroke="#fff" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="46" y="55" width="30" height="6.4" rx="3.2" fill="#fff"/>
    <rect width="100" height="100" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1.6"/>
  </g>
</symbol>
<symbol id="app-calculator" viewBox="0 0 100 100">
  <linearGradient id="ccB" x1="0" y1="0" x2=".2" y2="1"><stop offset="0" stop-color="#4a4a4e"/><stop offset="1" stop-color="#2a2a2d"/></linearGradient>
  <linearGradient id="ccO" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb03a"/><stop offset="1" stop-color="#f7921e"/></linearGradient>
  <g clip-path="url(#sqc)">
    <rect width="100" height="100" fill="url(#ccB)"/>
    <rect x="13" y="13" width="74" height="18" rx="4" fill="#111113"/>
    <rect x="66" y="19" width="16" height="5.5" rx="2.7" fill="#5a5a5f"/>
    <g fill="#e9e9ec">
      <rect x="13" y="37" width="15.5" height="12" rx="3.4"/><rect x="32.5" y="37" width="15.5" height="12" rx="3.4"/><rect x="52" y="37" width="15.5" height="12" rx="3.4"/>
      <rect x="13" y="53" width="15.5" height="12" rx="3.4"/><rect x="32.5" y="53" width="15.5" height="12" rx="3.4"/><rect x="52" y="53" width="15.5" height="12" rx="3.4"/>
      <rect x="13" y="69" width="15.5" height="12" rx="3.4"/><rect x="32.5" y="69" width="35" height="12" rx="3.4"/>
    </g>
    <g fill="url(#ccO)">
      <rect x="71.5" y="37" width="15.5" height="12" rx="3.4"/>
      <rect x="71.5" y="53" width="15.5" height="12" rx="3.4"/>
      <rect x="71.5" y="69" width="15.5" height="12" rx="3.4"/>
    </g>
    <rect width="100" height="100" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="1.6"/>
  </g>
</symbol>
<symbol id="app-settings" viewBox="0 0 100 100">
  <linearGradient id="stB" x1=".1" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#b2b2b8"/><stop offset=".5" stop-color="#8d8d93"/><stop offset="1" stop-color="#65656b"/></linearGradient>
  <radialGradient id="stG" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e2e2e6"/></radialGradient>
  <g clip-path="url(#sqc)">
    <rect width="100" height="100" fill="url(#stB)"/>
    <path fill="url(#stG)" d="M50 16.5c-2.6 0-4.8 1.9-5.2 4.4l-.9 5.6a25 25 0 0 0-5.3 2.2l-4.5-3.5a5.3 5.3 0 0 0-6.9.4l-2.6 2.6a5.3 5.3 0 0 0-.4 6.9l3.5 4.5a25 25 0 0 0-2.2 5.3l-5.6.9a5.3 5.3 0 0 0-4.4 5.2v3.8c0 2.6 1.9 4.8 4.4 5.2l5.6.9a25 25 0 0 0 2.2 5.3l-3.5 4.5a5.3 5.3 0 0 0 .4 6.9l2.6 2.6a5.3 5.3 0 0 0 6.9.4l4.5-3.5a25 25 0 0 0 5.3 2.2l.9 5.6a5.3 5.3 0 0 0 5.2 4.4h3.8c2.6 0 4.8-1.9 5.2-4.4l.9-5.6a25 25 0 0 0 5.3-2.2l4.5 3.5a5.3 5.3 0 0 0 6.9-.4l2.6-2.6a5.3 5.3 0 0 0 .4-6.9l-3.5-4.5a25 25 0 0 0 2.2-5.3l5.6-.9a5.3 5.3 0 0 0 4.4-5.2v-3.8c0-2.6-1.9-4.8-4.4-5.2l-5.6-.9a25 25 0 0 0-2.2-5.3l3.5-4.5a5.3 5.3 0 0 0-.4-6.9l-2.6-2.6a5.3 5.3 0 0 0-6.9-.4l-4.5 3.5a25 25 0 0 0-5.3-2.2l-.9-5.6a5.3 5.3 0 0 0-5.2-4.4zM50 37.8A12.2 12.2 0 1 1 37.8 50 12.2 12.2 0 0 1 50 37.8z"/>
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="1.4"/>
  </g>
</symbol>
<symbol id="app-trash" viewBox="0 0 100 100">
  <linearGradient id="trB" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#e3e8ee" stop-opacity=".82"/><stop offset=".26" stop-color="#fdfefe" stop-opacity=".95"/>
    <stop offset=".68" stop-color="#d7dde5" stop-opacity=".86"/><stop offset="1" stop-color="#b4bcc7" stop-opacity=".8"/>
  </linearGradient>
  <g>
    <path d="M27 33h46l-4.4 51.5a5 5 0 0 1-5 4.5H36.4a5 5 0 0 1-5-4.5z" fill="url(#trB)" stroke="rgba(92,104,122,.82)" stroke-width="1.8"/>
    <g stroke="rgba(88,100,118,.62)" stroke-width="1.5" fill="none">
      <path d="M38 34.5 36.6 88"/><path d="M46 34.5 45.6 88"/><path d="M54 34.5 54.4 88"/><path d="M62 34.5 63.4 88"/>
      <path d="M29.6 50h40.8"/><path d="M30.6 62.5h38.8"/><path d="M31.6 75h36.8"/>
    </g>
    <ellipse cx="50" cy="32" rx="25" ry="6.4" fill="#eef1f6" opacity=".97"/>
    <ellipse cx="50" cy="32" rx="25" ry="6.4" fill="none" stroke="rgba(88,100,118,.85)" stroke-width="2"/>
    <ellipse cx="50" cy="31.6" rx="19.4" ry="4.1" fill="rgba(76,88,106,.32)"/>
  </g>
</symbol>
<symbol id="f-folder" viewBox="0 0 64 64">
  <linearGradient id="fdA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd3fb"/><stop offset="1" stop-color="#4eb5f2"/></linearGradient>
  <linearGradient id="fdB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6dcfc"/><stop offset="1" stop-color="#59b9f4"/></linearGradient>
  <path d="M4 17.5A4.5 4.5 0 0 1 8.5 13h13.2c1.4 0 2.7.65 3.55 1.76L28 18h27.5A4.5 4.5 0 0 1 60 22.5V25H4z" fill="url(#fdA)"/>
  <path d="M4 24h56v27.5A4.5 4.5 0 0 1 55.5 56h-47A4.5 4.5 0 0 1 4 51.5z" fill="url(#fdB)"/>
  <path d="M4 24h56v1.6H4z" fill="rgba(255,255,255,.5)"/>
</symbol>
<symbol id="f-hd" viewBox="0 0 64 64">
  <linearGradient id="hdF" x1="0" y1="0" x2=".25" y2="1"><stop offset="0" stop-color="#f2f4f7"/><stop offset=".5" stop-color="#dadee5"/><stop offset="1" stop-color="#b0b7c2"/></linearGradient>
  <linearGradient id="hdT" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#fdfdfe"/><stop offset="1" stop-color="#dfe3ea"/></linearGradient>
  <linearGradient id="hdS" x1="0" y1="0" x2="1" y2=".4"><stop offset="0" stop-color="#b7bec9"/><stop offset="1" stop-color="#959daa"/></linearGradient>
  <ellipse cx="31" cy="51.4" rx="21" ry="2.9" fill="rgba(20,28,42,.16)"/>
  <path d="M13 25.5 20.5 18h36L49 25.5z" fill="url(#hdT)"/>
  <path d="M49 25.5 56.5 18v21.5L49 47z" fill="url(#hdS)"/>
  <path d="M13 25.5h36V47a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2z" fill="url(#hdF)"/>
  <path d="M13 25.5h36v1.5H13z" fill="rgba(255,255,255,.75)"/>
  <path d="M13 25.5 20.5 18h36L49 25.5V47a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2z" fill="none" stroke="rgba(88,98,116,.34)" stroke-width=".9"/>
  <g fill="rgba(120,130,148,.5)">
    <path d="M34.1 33.6c-.9 0-2.2.5-3 .5s-1.9-.5-3.1-.5c-2.2 0-4.3 1.8-4.3 5.2 0 2.1.8 4.3 1.8 5.7.8 1.2 1.5 2.1 2.6 2.1s1.4-.6 2.6-.6 1.5.6 2.6.6 1.8-1 2.6-2.2c.6-.9 1-1.9 1.1-2.1-1.4-.6-2.4-2-2.4-3.7s1-3 1.6-3.4c-.7-1-1.8-1.6-2.1-1.6z"/>
    <path d="M33.4 31.9c.6-.7 1-1.7.9-2.7-.9.1-1.9.6-2.5 1.3s-1 1.7-.9 2.6c1 .1 2-.5 2.5-1.2z"/>
  </g>
</symbol>
<symbol id="f-txt" viewBox="0 0 64 64">
  <linearGradient id="txP" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f2f3f6"/></linearGradient>
  <path d="M13 8h26l12 12v36a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z" fill="url(#txP)" stroke="rgba(60,70,86,.24)" stroke-width="1"/>
  <path d="M39 8l12 12H41a2 2 0 0 1-2-2z" fill="#d8dce3"/>
  <path d="M39 8l12 12H41a2 2 0 0 1-2-2z" fill="none" stroke="rgba(60,70,86,.2)" stroke-width=".9"/>
  <g fill="#9aa2ae"><rect x="19" y="26" width="26" height="1.9" rx=".95"/><rect x="19" y="30.6" width="21" height="1.9" rx=".95"/>
    <rect x="19" y="35.2" width="26" height="1.9" rx=".95"/><rect x="19" y="39.8" width="24" height="1.9" rx=".95"/>
    <rect x="19" y="44.4" width="14" height="1.9" rx=".95"/></g>
  <rect x="13" y="49" width="25" height="11" rx="3" fill="#8a919d"/>
  <text x="25.5" y="57.4" font-family="Inter,sans-serif" font-size="8.6" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing=".3">TXT</text>
</symbol>
<symbol id="f-pdf" viewBox="0 0 64 64">
  <path d="M13 8h26l12 12v36a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z" fill="#fff" stroke="rgba(0,0,0,.14)" stroke-width="1"/>
  <path d="M39 8l12 12H41a2 2 0 0 1-2-2z" fill="#e6e9ee"/>
  <g stroke="#b9bfc8" stroke-width="2" stroke-linecap="round"><path d="M20 30h24"/><path d="M20 37h18"/></g>
  <rect x="13" y="46" width="26" height="14" rx="3" fill="#e0403a"/>
  <text x="26" y="56" font-family="Inter,sans-serif" font-size="9.5" font-weight="700" fill="#fff" text-anchor="middle">PDF</text>
</symbol>
<symbol id="f-img" viewBox="0 0 64 64">
  <rect x="8" y="12" width="48" height="40" rx="4" fill="#fff" stroke="rgba(0,0,0,.14)"/>
  <linearGradient id="imS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ec8f5"/><stop offset="1" stop-color="#cfeafa"/></linearGradient>
  <rect x="11" y="15" width="42" height="34" rx="2.5" fill="url(#imS)"/>
  <circle cx="22" cy="25" r="4.5" fill="#ffd84d"/>
  <path d="M11 49 26 32l9 11 8-9 10 15z" fill="#4ba463"/>
</symbol>
<symbol id="g-apple" viewBox="0 0 15 18"><path fill="currentColor" d="M12.38 9.57c.02-2.28 1.86-3.38 1.94-3.43-1.06-1.55-2.7-1.76-3.29-1.79-1.4-.11-2.73.82-3.44.82-.71 0-1.81-.8-2.98-.78-1.53.02-2.95.89-3.74 2.26-1.6 2.77-.41 6.88 1.15 9.13.76 1.1 1.67 2.28 2.87 2.24 1.15-.05 1.59-.75 2.98-.75 1.39 0 1.78.74 2.99.72 1.24-.02 2.03-1.13 2.79-2.24.87-1.27 1.23-2.5 1.25-2.56-.03-.01-2.4-.93-2.42-3.62zM10.25 3.03c.63-.77 1.06-1.83.94-2.9-.94.04-2.07.63-2.74 1.4-.6.68-1.12 1.77-.98 2.81 1.05.08 2.13-.53 2.78-1.31z"/></symbol>
<symbol id="g-bt" viewBox="0 0 12 18"><path fill="currentColor" d="M5.2 8.36 1.63 4.9a.85.85 0 1 1 1.18-1.22L7.6 8.34a.85.85 0 0 1 0 1.23l-4.79 4.66a.85.85 0 1 1-1.18-1.22zM6.02 0c.24 0 .47.1.63.28l3.6 3.86a.9.9 0 0 1-.03 1.25L5.9 9.6l4.32 4.2a.9.9 0 0 1 .03 1.26l-3.6 3.86A.86.86 0 0 1 5.16 18V0z"/></symbol>
<symbol id="g-vol" viewBox="0 0 18 14"><path fill="currentColor" d="M8.2.6a.8.8 0 0 0-.86.1L3.6 4H1.4A1.4 1.4 0 0 0 0 5.4v3.2A1.4 1.4 0 0 0 1.4 10h2.2l3.74 3.3a.8.8 0 0 0 1.32-.6V1.32a.8.8 0 0 0-.46-.72z"/><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="vw"><path d="M11.4 4.9a3.6 3.6 0 0 1 0 4.2"/><path d="M13.9 2.8a7 7 0 0 1 0 8.4"/></g></symbol>
<symbol id="g-wifi" viewBox="0 0 18 14"><path fill="currentColor" d="M9 11.02a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zm0-3.7c-1.3 0-2.5.5-3.4 1.35a.72.72 0 0 0-.02 1.03l.5.5c.27.27.7.28.99.03A3.5 3.5 0 0 1 9 9.32c.72 0 1.4.24 1.93.65.29.25.72.24.99-.03l.5-.5a.72.72 0 0 0-.02-1.03A4.94 4.94 0 0 0 9 7.32zm0-3.72a8.6 8.6 0 0 0-5.99 2.4.72.72 0 0 0-.01 1.03l.5.5c.28.27.71.28.99.02A7.1 7.1 0 0 1 9 5.6c1.72 0 3.36.6 4.6 1.72.28.25.71.24.99-.03l.5-.5a.72.72 0 0 0-.01-1.02A8.6 8.6 0 0 0 9 3.6zm0-3.6C6.02 0 3.19 1.1 1.06 3.08a.72.72 0 0 0-.02 1.03l.49.5c.28.27.71.28.99.03A9.9 9.9 0 0 1 9 2c2.47 0 4.79.94 6.48 2.63.28.26.71.25.99-.02l.49-.5a.72.72 0 0 0-.02-1.03A11.53 11.53 0 0 0 9 0z"/></symbol>
<symbol id="g-search" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"><circle cx="6.9" cy="6.9" r="4.9"/><path d="M10.6 10.6 14.4 14.4"/></g></symbol>
<symbol id="g-cc" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="1.4" y="2.6" width="13.2" height="4.2" rx="2.1"/><rect x="1.4" y="9.2" width="13.2" height="4.2" rx="2.1"/><path d="M10.6 2.6v4.2"/><path d="M5.4 9.2v4.2"/></g></symbol>`;

export function MacosSprite() {
  return (
    <svg
      aria-hidden='true'
      focusable='false'
      width='1'
      height='1'
      viewBox='0 0 1 1'
      style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
    >
      <defs dangerouslySetInnerHTML={{ __html: spriteMarkup }} />
    </svg>
  );
}

export function MacosIcon({ symbol, className = '' }: { symbol: MacosAppSymbol | MacosFileSymbol | MacosGlyphSymbol; className?: string }) {
  const viewBox = symbol.startsWith('g-') ? glyphViewBoxes[symbol as MacosGlyphSymbol] : symbol.startsWith('f-') ? '0 0 64 64' : '0 0 100 100';
  return (
    <svg className={className} viewBox={viewBox} aria-hidden='true'>
      <use href={`#${symbol}`} />
    </svg>
  );
}
