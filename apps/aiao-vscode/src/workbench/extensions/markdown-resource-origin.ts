export function isTikzResource(url: string): boolean {
  return URL.canParse(url) && new URL(url).origin === 'https://tikzjax.com';
}
