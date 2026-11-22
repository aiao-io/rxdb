const section = /^\s*\[remote\s+"origin"\]\s*(?:[#;].*)?$/i;

function sections(config: string): string[] {
  return config.split(/(?=^[\t ]*\[)/m);
}

export function originUrl(config: string): string | null {
  const origin = sections(config).find(text => section.test(text.split('\n', 1)[0]));
  return origin?.match(/^\s*url\s*=\s*(.+)$/im)?.[1].trim().replace(/^"(.*)"$/, '$1') ?? null;
}

export function withOrigin(config: string, url: string | null): string {
  const rest = sections(config).filter(text => !section.test(text.split('\n', 1)[0])).join('');
  if (url === null) return rest;
  if (!/^https:\/\/github\.com\/[a-z\d-]+\/[\w.-]+\.git$/i.test(url)) throw new Error('Invalid GitHub remote URL');
  return `${rest.trimEnd()}\n[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`;
}
