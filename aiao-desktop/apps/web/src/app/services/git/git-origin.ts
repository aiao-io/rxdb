const section = /^\s*\[remote\s+"origin"\]\s*(?:[#;].*)?$/i;
const urlLine = /^([\t ]*url[\t ]*=[\t ]*)([^\r\n]*)/im;

function sections(config: string): string[] {
  return config.split(/(?=^[\t ]*\[)/m);
}

function isOrigin(text: string): boolean {
  return section.test(text.split('\n', 1)[0]);
}

export function originUrl(config: string): string | null {
  return (
    sections(config)
      .find(isOrigin)
      ?.match(urlLine)?.[2]
      .trim()
      .replace(/^"(.*)"$/, '$1') || null
  );
}

export function withOrigin(config: string, url: string | null): string {
  const parts = sections(config);
  if (url === null) return parts.filter(text => !isOrigin(text)).join('');
  if (!/^https:\/\/github\.com\/[a-z\d-]+\/[\w.-]+\.git$/i.test(url)) throw new Error('Invalid GitHub remote URL');
  const index = parts.findIndex(isOrigin);
  if (index === -1)
    return `${config.trimEnd()}\n[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`;
  const origin = parts[index];
  parts[index] = urlLine.test(origin) ? origin.replace(urlLine, `$1${url}`) : `${origin.trimEnd()}\n\turl = ${url}\n`;
  return parts.join('');
}
