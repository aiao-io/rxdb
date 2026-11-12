const form = document.querySelector('#signin');
const account = document.querySelector('#account');
const status = document.querySelector('#status');
const signout = document.querySelector('#signout');

function showError(message) {
  status.textContent = message;
  status.setAttribute('data-error', '');
}

async function auth(path, body) {
  const response = await fetch(`/bff/auth/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? '登录服务暂时不可用，请稍后重试。');
  return result;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = form.querySelector('button');
  submit.disabled = true;
  status.textContent = '正在登录…';
  status.removeAttribute('data-error');
  try {
    const fields = new FormData(form);
    await auth('signin', { email: fields.get('email'), password: fields.get('password') });
    location.assign('/model-designer/canvas');
  } catch (error) {
    showError(error.message);
  } finally {
    submit.disabled = false;
  }
});

signout.addEventListener('click', async () => {
  signout.disabled = true;
  try {
    await auth('signout', {});
    form.hidden = false;
    account.hidden = true;
    form.reset();
    status.textContent = '已退出登录。';
    status.removeAttribute('data-error');
  } catch (error) {
    showError(error.message);
  } finally {
    signout.disabled = false;
  }
});

auth('session')
  .then(({ user }) => {
    if (!user) return;
    document.querySelector('#identity').textContent = `已登录：${user.email ?? user.id}`;
    form.hidden = true;
    account.hidden = false;
  })
  .catch(error => showError(error.message));
