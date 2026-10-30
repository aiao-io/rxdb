import { imageGenerationRequest, isMiniMaxImageProvider } from '../../src/contracts/image-provider-protocol.ts';
import { handleAdmin } from './admin-api.mjs';
import { handlePlatform } from './platform-api.mjs';
import { handleSupabaseOAuth } from './supabase-oauth.mjs';
import { publishedTemplates, runtimePolicy } from './product-content.mjs';
import { endpoint, originAllowed } from './product-http.mjs';
export { PlatformCoordinator } from './platform-coordinator.mjs';
// Optional, stateless relay. Static assets are served by the ASSETS binding.
const json = (status, error) =>
  Response.json(
    { error },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer'
      }
    }
  );
async function probeProvider(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      // Workers supports follow/manual; error throws before any network I/O.
      redirect: 'manual',
      signal: controller.signal,
      ...init
    });
    await response.body?.cancel();
    return {
      ok: true,
      status: response.status,
      contentType: response.headers.get('content-type'),
      allowOrigin: response.headers.get('access-control-allow-origin'),
      elapsedMs: Date.now() - started
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.name : 'fetch_failed',
      // fetch failures carry no credentials; the message is what
      // distinguishes egress problems from provider problems.
      detail: error instanceof Error ? String(error.message).slice(0, 200) : '',
      elapsedMs: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}
async function providerProbe(env, origin) {
  let targets;
  try {
    targets = JSON.parse(env.ALLOWED_PROVIDER_BASE_URLS || '[]').map(base);
  } catch {
    return { error: 'Invalid provider configuration' };
  }
  if (!targets.length) return { error: 'No provider is enabled for this relay' };
  const checks = await Promise.all(
    targets.map(async target => {
      const imageRequest = imageGenerationRequest(target, {
        model: 'image-01',
        prompt: 'reachability-probe',
        size: '1024x1024'
      });
      const endpoint = imageRequest.url;
      // Server-to-server reachability is what the relay needs. A keyless POST
      // costs nothing: providers answer 401 and prove the path works. The
      // OPTIONS preflight only matters for browser-direct mode, which needs
      // provider CORS support that the relay never uses.
      const [root, api, preflight] = await Promise.all([
        probeProvider(`${target}/`),
        probeProvider(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            isMiniMaxImageProvider(target) ?
              imageRequest.body
            : {
                model: 'reachability-probe',
                prompt: 'reachability-probe',
                n: 1,
                size: '1024x1024'
              }
          )
        }),
        probeProvider(endpoint, {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,content-type'
          }
        })
      ]);
      return {
        target,
        root,
        api,
        preflight,
        reachable: root.ok && api.ok,
        browserDirect:
          preflight.ok &&
          preflight.status >= 200 &&
          preflight.status < 300 &&
          (preflight.allowOrigin === origin || preflight.allowOrigin === '*')
      };
    })
  );
  const controls = await Promise.all(
    ['https://example.com/', 'https://www.cloudflare.com/', 'https://api.openai.com/v1/models'].map(target =>
      probeProvider(target)
    )
  );
  const interpretation = [];
  if (!controls.every(check => check.ok))
    interpretation.push('Cloudflare could not reach every public control site; Worker egress may be degraded.');
  if (checks.every(check => check.reachable))
    interpretation.push(
      'Every enabled provider is reachable from Cloudflare; authenticated relay generation still needs verification.'
    );
  else interpretation.push('At least one provider is unreachable from Cloudflare; compare the per-provider checks.');
  const direct = checks.filter(check => check.browserDirect).length;
  interpretation.push(
    direct === checks.length ?
      'Browser-direct mode is available for every provider.'
    : `Browser-direct mode works for ${direct} of ${checks.length} providers; the rest must use relay (proxy) mode.`
  );
  return {
    checkedAt: new Date().toISOString(),
    controls,
    providers: checks,
    interpretation: interpretation.join(' ')
  };
}
const jsonPayload = (payload, status = 200) =>
  Response.json(payload, {
    status,
    headers: {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer'
    }
  });
function base(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('Invalid base');
  return url.href.replace(/\/+$/, '');
}

const encoder = new TextEncoder();
const navigationPaths = new Set(['/', '/create', '/images', '/providers', '/admin']);
async function fetchAsset(request, env) {
  const response = await env.ASSETS.fetch(request);
  const pathname = new URL(request.url).pathname;
  if (
    request.method === 'GET' &&
    (navigationPaths.has(pathname) ||
      pathname === '/offline-worker.js' ||
      pathname === '/offline-manifest.json' ||
      pathname === '/offline-shell.html')
  ) {
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'no-store');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
  return response;
}
const upstreamStatus = status => ([400, 401, 403, 404, 413, 422, 429].includes(status) ? status : 502);

// Image generation can take tens of seconds. Keep a slow upstream response alive
// after the edge has committed the response headers. Whitespace is valid JSON and
// is ignored by JSON.parse once the final provider payload arrives.
function lateRelayResponse(responsePromise, upstreamController, cleanup) {
  return new Response(
    new ReadableStream({
      async start(stream) {
        const heartbeat = setInterval(() => {
          try {
            stream.enqueue(encoder.encode(' \n'));
          } catch {
            clearInterval(heartbeat);
          }
        }, 8000);
        try {
          const response = await responsePromise;
          clearInterval(heartbeat);
          if (!response.ok) {
            await response.body?.cancel();
            stream.enqueue(
              encoder.encode(
                JSON.stringify({
                  error: 'Provider rejected or failed; review provider history',
                  status: upstreamStatus(response.status)
                })
              )
            );
            stream.close();
            return;
          }
          if (!response.body || !response.headers.get('content-type')?.includes('application/json')) {
            await response.body?.cancel();
            stream.enqueue(
              encoder.encode(
                JSON.stringify({
                  error: 'Invalid provider response',
                  status: 502
                })
              )
            );
            stream.close();
            return;
          }
          const source = response.body.getReader();
          let total = 0;
          try {
            while (true) {
              const { done, value } = await source.read();
              if (done) break;
              total += value.byteLength;
              if (total > 24 * 1024 * 1024) throw new Error('Response too large');
              stream.enqueue(value);
            }
            stream.close();
          } catch (error) {
            await source.cancel().catch(() => undefined);
            stream.error(error);
          }
        } catch {
          stream.enqueue(
            encoder.encode(
              JSON.stringify({
                error: 'Provider connection interrupted; review provider history before retrying',
                status: 502
              })
            )
          );
          stream.close();
        } finally {
          clearInterval(heartbeat);
          cleanup();
        }
      },
      cancel() {
        upstreamController.abort();
        cleanup();
      }
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'x-aiao-relay-stream': 'late-upstream'
      }
    }
  );
}
const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return fetchAsset(request, env);
    if (url.pathname.startsWith('/api/platform/')) return handlePlatform(request, env);
    if (url.pathname.startsWith('/api/supabase/oauth/')) return handleSupabaseOAuth(request, env);
    if (url.pathname.startsWith('/api/admin/')) return handleAdmin(request, env);
    if (url.pathname === '/api/templates' && request.method === 'GET') return endpoint(() => publishedTemplates(env));
    if (url.pathname === '/api/provider-policies' && request.method === 'GET')
      return endpoint(async () => ({ policy: await runtimePolicy(env) }));
    if (url.pathname === '/api/provider-probe') {
      if (request.method !== 'GET') return json(405, 'GET required');
      return jsonPayload(await providerProbe(env, url.origin));
    }
    if (url.pathname !== '/api/relay') return json(404, 'Unknown API');
    if (request.method !== 'POST') return json(405, 'POST required');
    if (!originAllowed(request, env)) return json(403, 'Same-origin browser request required');
    let upstream, policy;
    try {
      upstream = base(request.headers.get('x-provider-base') ?? '');
      policy = await runtimePolicy(env);
      const allowed =
        policy ?
          policy.providers.filter(provider => provider.enabled && provider.proxy).map(provider => provider.baseUrl)
        : JSON.parse(env.ALLOWED_PROVIDER_BASE_URLS || '[]').map(base);
      if (!allowed.includes(upstream)) return json(403, 'Provider is not enabled for this relay');
    } catch {
      return json(400, 'Invalid provider configuration');
    }
    const authorization = request.headers.get('authorization') ?? '';
    if (!/^Bearer [\x21-\x7e]{1,4096}$/.test(authorization)) return json(400, 'API Key required');
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json(400, 'JSON required');
    const controller = new AbortController();
    const stop = () => controller.abort();
    request.signal.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(stop, 180000);
    const cleanup = () => {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', stop);
    };
    try {
      // Bound reads before JSON parsing. Only single-image generation parameters are forwarded.
      const reader = request.body?.getReader();
      if (!reader) {
        cleanup();
        return json(400, 'Body required');
      }
      const chunks = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 16 * 1024) {
          await reader.cancel();
          cleanup();
          return json(413, 'Body too large');
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
      }
      let data;
      try {
        data = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        cleanup();
        return json(400, 'Invalid JSON');
      }
      if (
        !data ||
        typeof data.model !== 'string' ||
        !data.model.trim() ||
        data.model.length > 200 ||
        typeof data.prompt !== 'string' ||
        !data.prompt.trim() ||
        data.prompt.length > 2000 ||
        data.n !== 1 ||
        !['1024x1024', '1536x1024', '1024x1536'].includes(data.size)
      ) {
        cleanup();
        return json(400, 'Invalid image request');
      }
      const activeProvider = policy?.providers.find(provider => provider.baseUrl === upstream);
      if (
        activeProvider &&
        (!activeProvider.models.includes(data.model) || !activeProvider.sizes.includes(data.size))
      ) {
        cleanup();
        return json(403, 'Model or size is disabled by the active provider policy');
      }
      const imageRequest = imageGenerationRequest(upstream, data);
      if (!imageRequest) {
        cleanup();
        return json(400, 'Unsupported image model or prompt length');
      }
      if (controller.signal.aborted) throw new Error('Aborted');
      const responsePromise = fetch(imageRequest.url, {
        method: 'POST',
        // Do not follow redirects with the Key. Non-2xx responses are rejected
        // below in both the immediate and delayed response paths.
        redirect: 'manual',
        signal: controller.signal,
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify(imageRequest.body)
      });
      const early = await Promise.race([
        responsePromise.then(response => ({ kind: 'response', response })).catch(error => ({ kind: 'error', error })),
        new Promise(resolve => setTimeout(() => resolve({ kind: 'pending' }), 250))
      ]);
      if (early.kind === 'pending') {
        const response = lateRelayResponse(responsePromise, controller, cleanup);
        response.headers.set('x-aiao-policy-version', String(policy?.revision ?? 'deployment'));
        return response;
      }
      if (early.kind === 'error') throw early.error;
      const response = early.response;
      if (!response.ok) {
        await response.body?.cancel();
        cleanup();
        return json(
          [400, 401, 403, 404, 413, 422, 429].includes(response.status) ? response.status : 502,
          'Provider rejected or failed; review provider history'
        );
      }
      if (!response.body || !response.headers.get('content-type')?.includes('application/json')) {
        await response.body?.cancel();
        cleanup();
        return json(502, 'Invalid provider response');
      }
      const source = response.body.getReader();
      let total = 0;
      // Stream the image JSON without retaining the result in Worker memory or storage.
      const body = new ReadableStream({
        async pull(target) {
          try {
            const { done, value } = await source.read();
            if (done) {
              cleanup();
              target.close();
              return;
            }
            total += value.length;
            if (total > 24 * 1024 * 1024) throw new Error('Response too large');
            target.enqueue(value);
          } catch {
            controller.abort();
            await source.cancel().catch(() => undefined);
            cleanup();
            target.error(new Error('Provider stream interrupted'));
          }
        },
        async cancel() {
          controller.abort();
          cleanup();
          await source.cancel().catch(() => undefined);
        }
      });
      return new Response(body, {
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
          'x-aiao-policy-version': String(policy?.revision ?? 'deployment')
        }
      });
    } catch {
      cleanup();
      return json(502, 'Provider connection interrupted; review provider history before retrying');
    }
  }
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    const desktop = origin === 'tauri://localhost' && env.MEDIA_ALLOW_DESKTOP_ORIGIN === 'true';
    if (request.method === 'OPTIONS' && new URL(request.url).pathname.startsWith('/api/')) {
      if (!desktop) return json(403, 'Origin is not enabled');
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET,POST,DELETE',
          'access-control-allow-headers': 'authorization,content-type,x-provider-base',
          'access-control-max-age': '600',
          vary: 'Origin'
        }
      });
    }
    const result = await worker.fetch(request, env);
    if (!desktop || !new URL(request.url).pathname.startsWith('/api/')) return result;
    const headers = new Headers(result.headers);
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
    return new Response(result.body, { status: result.status, headers });
  }
};
