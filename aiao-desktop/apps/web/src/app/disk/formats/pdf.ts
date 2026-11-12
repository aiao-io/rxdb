export interface PdfSection {
  readonly title: string;
  readonly text: string;
}

/** 一份纯文本文档：标题、可选的副标题，加若干节。 */
export interface PdfDocument {
  readonly title: string;
  readonly subtitle?: string;
  readonly sections: readonly PdfSection[];
}

type FontId = 'F1' | 'F2';

interface Line {
  readonly font: FontId;
  readonly size: number;
  readonly text: string;
  /** 这一行上方额外留的空白（pt）。 */
  readonly gap: number;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 72;
const TITLE_SIZE = 22;
const SUBTITLE_SIZE = 12;
const HEADING_SIZE = 13;
const BODY_SIZE = 11;
const LEADING = 1.45;
/** Helvetica 11pt 在 468pt 行宽里大约放得下的字符数。 */
const BODY_COLUMNS = 86;

/** WinAnsiEncoding 里 0x80～0x9F 一段与 Latin-1 不同，只收文档会用到的标点。 */
const WIN_ANSI: Readonly<Record<string, number>> = {
  '…': 0x85,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97
};
const FROM_WIN_ANSI = new Map(Object.entries(WIN_ANSI).map(([char, code]) => [code, char]));

const toWinAnsi = (text: string): string =>
  Array.from(text, char => {
    const mapped = WIN_ANSI[char];
    if (mapped !== undefined) return String.fromCharCode(mapped);
    const code = char.charCodeAt(0);
    return code < 0x100 && (code < 0x80 || code > 0x9f) ? char : '?';
  }).join('');

const fromWinAnsi = (text: string): string =>
  Array.from(text, char => FROM_WIN_ANSI.get(char.charCodeAt(0)) ?? char).join('');

const escapePdf = (text: string): string => text.replace(/[\\()]/g, char => `\\${char}`);

const unescapePdf = (text: string): string => text.replace(/\\([\\()])/g, '$1');

/** 按空格折行；超长的单词硬切。 */
function wrap(text: string, columns: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const pieces = word.match(new RegExp(`.{1,${columns}}`, 'g')) ?? [word];
    for (const piece of pieces) {
      const next = line ? `${line} ${piece}` : piece;
      if (next.length > columns && line) {
        lines.push(line);
        line = piece;
      } else line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function layout(doc: PdfDocument): Line[] {
  const lines: Line[] = [{ font: 'F2', size: TITLE_SIZE, text: doc.title, gap: 0 }];
  if (doc.subtitle) lines.push({ font: 'F1', size: SUBTITLE_SIZE, text: doc.subtitle, gap: 2 });
  for (const section of doc.sections) {
    lines.push({ font: 'F2', size: HEADING_SIZE, text: section.title, gap: 14 });
    for (const [i, text] of wrap(section.text, BODY_COLUMNS).entries())
      lines.push({ font: 'F1', size: BODY_SIZE, text, gap: i === 0 ? 4 : 0 });
  }
  return lines;
}

/** 分页：每行占 `size × LEADING`，放不下就换页。 */
function paginate(lines: readonly Line[]): { line: Line; y: number }[][] {
  const pages: { line: Line; y: number }[][] = [[]];
  let y = PAGE_HEIGHT - MARGIN;
  for (const line of lines) {
    const height = line.size * LEADING + line.gap;
    if (y - height < MARGIN && pages[pages.length - 1].length) {
      pages.push([]);
      y = PAGE_HEIGHT - MARGIN;
    }
    y -= height;
    pages[pages.length - 1].push({ line, y });
  }
  return pages;
}

const contentStream = (page: readonly { line: Line; y: number }[]): string =>
  page
    .map(
      ({ line, y }) =>
        `BT /${line.font} ${line.size} Tf 1 0 0 1 ${MARGIN} ${y.toFixed(1)} Tm (${escapePdf(toWinAnsi(line.text))}) Tj ET`
    )
    .join('\n');

const latin1Bytes = (text: string): Uint8Array => Uint8Array.from(text, char => char.charCodeAt(0));

/** 生成一份只含文字的 PDF 1.4（Helvetica，WinAnsi 编码，不压缩）。 */
export function textPdf(doc: PdfDocument): Uint8Array {
  const pages = paginate(layout(doc));
  const pageIds = pages.map((_, i) => 6 + i * 2);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Title (${escapePdf(toWinAnsi(doc.title))}) /Producer (Aiao Desktop) >>`,
    ...pages.flatMap((page, i) => {
      const stream = contentStream(page);
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`,
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
      ];
    })
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  const rows = offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${rows}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return latin1Bytes(body);
}

const RUN = /\/(F[12]) (\d+(?:\.\d+)?) Tf 1 0 0 1 [\d.]+ [\d.]+ Tm \(((?:\\.|[^\\)])*)\) Tj/g;

/** 读回 `textPdf` 生成的文档：标题、各节标题与正文（折行重新拼成段落）。别的 PDF 返回 `null`。 */
export function readPdfText(bytes: Uint8Array): PdfDocument | null {
  const source = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  if (!source.startsWith('%PDF-')) return null;
  const runs = [...source.matchAll(RUN)].map(([, font, size, text]) => ({
    heading: font === 'F2',
    size: Number(size),
    text: fromWinAnsi(unescapePdf(text))
  }));
  if (!runs.length || runs[0].size !== TITLE_SIZE) return null;
  const subtitle = runs[1] && !runs[1].heading && runs[1].size === SUBTITLE_SIZE ? runs[1].text : null;
  const sections: { title: string; text: string }[] = [];
  for (const run of runs.slice(subtitle === null ? 1 : 2)) {
    if (run.heading) sections.push({ title: run.text, text: '' });
    else if (sections.length) {
      const last = sections[sections.length - 1];
      last.text = last.text ? `${last.text} ${run.text}` : run.text;
    }
  }
  return subtitle === null ? { title: runs[0].text, sections } : { title: runs[0].text, subtitle, sections };
}
