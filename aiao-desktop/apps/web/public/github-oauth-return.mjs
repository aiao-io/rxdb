const params = new URLSearchParams(location.hash.slice(1));
history.replaceState(null, '', location.pathname);
const state = params.get('state');
const code = params.get('code');
const error = params.get('error');
const status = document.querySelector('#status');
if (state && Boolean(code) !== Boolean(error)) {
  const channel = new BroadcastChannel(`aiao-code.github-oauth:${state}`);
  channel.postMessage(code ? { code } : { error });
  channel.close();
  status.textContent = '已返回授权结果，可以关闭此窗口。';
  window.close();
} else {
  status.textContent = '缺少 GitHub 授权结果，请关闭此窗口后重试。';
}
