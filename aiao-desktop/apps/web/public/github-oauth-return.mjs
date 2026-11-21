const CODE_ORIGIN = 'https://vscode.aiao.io';
const CALLBACK_PATH = '/github-callback';
const NONCE_PATTERN = /^[0-9a-f]{32}$/;
const source =
  location.search ? location.search
  : location.hash.startsWith('#') ? location.hash.slice(1)
  : '';
const params = new URLSearchParams(source);
const status = document.querySelector('#status');
const values = name => params.getAll(name);
const states = values('state');
const codes = values('code');
const errors = values('error');
const state = states[0];
const code = codes[0];
const error = errors[0];

function validState(value) {
  if (typeof value !== 'string' || value.length > 2048 || !URL.canParse(value)) return false;
  const callback = new URL(value);
  const names = [...callback.searchParams.keys()].sort();
  return (
    callback.origin === CODE_ORIGIN &&
    callback.pathname === CALLBACK_PATH &&
    !callback.username &&
    !callback.password &&
    !callback.hash &&
    names.join(',') === 'desktop,nonce' &&
    callback.searchParams.getAll('desktop').length === 1 &&
    callback.searchParams.get('desktop') === location.origin &&
    callback.searchParams.getAll('nonce').length === 1 &&
    NONCE_PATTERN.test(callback.searchParams.get('nonce') ?? '')
  );
}

const validStateResult = states.length === 1 && validState(state);
const hasCode = codes.length === 1 && typeof code === 'string' && code.length > 0 && code.length <= 4096;
const hasError = errors.length === 1 && (error === 'access_denied' || error === 'oauth_failed');
const validResult = validStateResult && hasCode !== hasError && values('state').length === 1;

history.replaceState(null, '', location.pathname);
if (validResult) {
  const channel = new BroadcastChannel(`aiao-code.github-oauth:${state}`);
  channel.postMessage(hasCode ? { code } : { error });
  channel.close();
  status.textContent = '已返回授权结果，可以关闭此窗口。';
  window.close();
} else {
  status.textContent = '缺少有效的 GitHub 授权结果，请关闭此窗口后重试。';
}
