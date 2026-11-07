const element = id => document.getElementById(id);
const form = element('generate-form');
const status = element('status');
const maxImageBytes = 16 * 1024 * 1024;
let busy = false;
let controller;
let previewUrl;
let requestCount = 0;

class ProbeError extends Error {
  constructor(message, phase = 'result_unavailable') {
    super(message);
    this.phase = phase;
  }
}
function showStatus(phase, message) {
  status.dataset.phase = phase;
  status.dataset.requests = String(requestCount);
  status.textContent = message;
}
function setBusy(value) {
  busy = value;
  element('generate').disabled = value;
  element('cancel').disabled = !value;
  for (const id of ['base-url', 'model', 'api-key', 'size', 'prompt', 'clear-key']) element(id).disabled = value;
}
function configuration() {
  let base;
  try {
    base = new URL(element('base-url').value.trim());
  } catch {
    throw new ProbeError('请填写有效的供应商 HTTPS Base URL。', 'rejected');
  }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash)
    throw new ProbeError('Base URL 必须使用 HTTPS，且不包含凭据、query 或 fragment。', 'rejected');
  base.pathname = base.pathname.replace(/\/+$/, '') + '/images/generations';
  const model = element('model').value.trim();
  const key = element('api-key').value.trim();
  const prompt = element('prompt').value.trim();
  if (!model || model.length > 128 || Array.from(model).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))
    throw new ProbeError('请填写有效的模型名称。', 'rejected');
  if (!/^[\x21-\x7e]{1,4096}$/.test(key)) throw new ProbeError('请填写有效的 API Key。', 'rejected');
  if (!prompt || prompt.length > 2000) throw new ProbeError('请输入 1～2000 字的提示词。', 'rejected');
  return {
    url: base.href,
    key,
    body: {
      model,
      prompt,
      n: 1,
      size: element('size').value,
      quality: 'low',
      output_format: 'png'
    }
  };
}
async function readBounded(response, maxBytes) {
  if (!response.body) throw new ProbeError('供应商响应为空。');
  const declared = response.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body.cancel();
    throw new ProbeError('供应商响应超过本次验证的大小限制。');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new ProbeError('供应商响应超过本次验证的大小限制。');
      chunks.push(value);
    }
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    finished = true;
    return result;
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
async function imageBlob(data, signal) {
  const item = Array.isArray(data?.data) && data.data.length === 1 ? data.data[0] : null;
  if (!item) throw new ProbeError('供应商未返回预期的单张图片数据；请先核对供应商记录。');
  if (typeof item.b64_json === 'string') {
    const value = item.b64_json;
    if (
      !value.length ||
      value.length > 4 * Math.ceil(maxImageBytes / 3) ||
      value.length % 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
    )
      throw new ProbeError('供应商返回的 base64 图片无效或超过 16 MiB。');
    try {
      const binary = atob(value);
      if (binary.length > maxImageBytes || btoa(binary) !== value) throw new Error();
      return new Blob([Uint8Array.from(binary, c => c.charCodeAt(0))], {
        type: 'image/png'
      });
    } catch {
      throw new ProbeError('供应商返回的 base64 图片无法读取。');
    }
  }
  if (typeof item.url === 'string') {
    let url;
    try {
      url = new URL(item.url);
    } catch {
      throw new ProbeError('供应商返回的图片地址无效。');
    }
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new ProbeError('供应商返回的图片地址必须使用不含凭据的 HTTPS URL。');
    try {
      // Never forward the provider's Authorization header to an image URL.
      const response = await fetch(url, {
        mode: 'cors',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal
      });
      if (!response.ok) throw new Error();
      return new Blob([await readBounded(response, maxImageBytes)], {
        type: 'image/png'
      });
    } catch {
      throw new ProbeError(
        '供应商已返回图片地址，但浏览器未能读取。请核对图片地址的跨域支持；不要通过重新生成来重试下载。'
      );
    }
  }
  throw new ProbeError('响应没有 b64_json 或可读取的图片地址。');
}
async function validatePng(blob, size) {
  if (blob.size < 45 || blob.size > maxImageBytes) throw new ProbeError('图片为空、损坏或超过 16 MiB。');
  const bytes = new Uint8Array(await blob.slice(0, 33).arrayBuffer());
  const view = new DataView(bytes.buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (
    !signature.every((n, i) => bytes[i] === n) ||
    view.getUint32(8) !== 13 ||
    String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR' ||
    !width ||
    !height ||
    width > 4096 ||
    height > 4096
  )
    throw new ProbeError('返回文件不是本次支持的 PNG 或尺寸超限。');
  const [requestedWidth, requestedHeight] = size.split('x').map(Number);
  if (Math.sign(width - height) !== Math.sign(requestedWidth - requestedHeight))
    throw new ProbeError('供应商返回的图片方向与选择的画幅不一致。');
  let decoded;
  try {
    decoded = await createImageBitmap(blob);
    if (decoded.width !== width || decoded.height !== height) throw new Error();
  } catch {
    throw new ProbeError('返回图片无法在浏览器中解码。');
  } finally {
    decoded?.close();
  }
  return { width, height };
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  let config;
  try {
    config = configuration();
  } catch (error) {
    showStatus('rejected', error instanceof ProbeError ? error.message : '请检查配置。');
    return;
  }
  setBusy(true);
  controller = new AbortController();
  const signal = controller.signal;
  const timeout = setTimeout(() => controller.abort(), 150000);
  const started = performance.now();
  let responded = false;
  requestCount++;
  showStatus('sending', '正在从浏览器直连供应商，请保持页面打开…');
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.key}`
      },
      body: JSON.stringify(config.body)
    });
    responded = true;
    status.dataset.httpStatus = String(response.status);
    if (!response.ok) {
      await response.body?.cancel();
      const hint =
        response.status === 401 || response.status === 403 ? '请检查 Key、权限和供应商限制。'
        : response.status === 429 ? '请检查供应商余额或限流状态。'
        : '请先核对供应商记录。';
      throw new ProbeError(
        `供应商返回 HTTP ${response.status}。${hint}本页不会自动重试。`,
        response.status >= 500 ? 'unknown' : 'rejected'
      );
    }
    if (!/application\/(?:[a-z0-9.+-]+\+)?json/i.test(response.headers.get('content-type') ?? ''))
      throw new ProbeError('供应商未返回 JSON 图片响应；请核对协议和请求记录。');
    const bytes = await readBounded(response, 24 * 1024 * 1024);
    let data;
    try {
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new ProbeError('供应商 JSON 响应无法解析；请先核对请求记录。');
    }
    const blob = await imageBlob(data, signal);
    const { width, height } = await validatePng(blob, config.body.size);
    if (signal.aborted) throw new Error();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    element('result-image').src = previewUrl;
    element('result-image').hidden = false;
    element('empty-result').hidden = true;
    const download = element('download');
    download.href = previewUrl;
    download.download = `aiao-direct-${Date.now()}.png`;
    download.hidden = false;
    status.dataset.width = String(width);
    status.dataset.height = String(height);
    status.dataset.bytes = String(blob.size);
    element('result-info').textContent =
      `${width} × ${height} · PNG · ${(blob.size / 1024).toFixed(1)} KiB · ${((performance.now() - started) / 1000).toFixed(1)} 秒`;
    showStatus('completed', '浏览器已读取并验证真实图片。请下载保存，本页未写入本地作品库。');
  } catch (error) {
    if (error instanceof ProbeError) showStatus(error.phase, error.message);
    else
      showStatus(
        responded ? 'result_unavailable' : 'unknown',
        responded ?
          '已收到供应商响应，但结果读取未完成。请先核对记录，不要直接重新生成。'
        : '请求未完成：可能受跨域限制、网络或超时影响。供应商是否已收到请求尚不确定，请先核对记录；本页不会自动重试。'
      );
  } finally {
    clearTimeout(timeout);
    config.key = '';
    controller = undefined;
    setBusy(false);
  }
});
element('cancel').addEventListener('click', () => controller?.abort());
element('clear-key').addEventListener('click', () => {
  element('api-key').value = '';
});
window.addEventListener('pagehide', () => {
  element('api-key').value = '';
  controller?.abort();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
});
