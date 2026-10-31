export function installFetchCapture({ generationUrl, pageOrigin, generationLimit, resultLimit, timeoutMs }) {
  const state = {
    generation: null,
    results: new Map(),
    duplicateResults: new Set(),
    resultCaptureCount: 0,
    armed: false,
    resultLimitReached: false
  };
  globalThis.__AIAO_ACCEPTANCE_CAPTURE__ = state;
  const nativeFetch = globalThis.fetch.bind(globalThis);

  async function boundedClone(response, limit, prefix) {
    let reader,
      timer,
      timedOut = false;
    const failed = suffix => ({ ok: false, code: `${prefix}_CAPTURE_${suffix}` });
    try {
      reader = response.clone().body?.getReader();
      if (!reader) return failed('FAILED');
      const stop = () => {
        void reader.cancel().catch(() => undefined);
      };
      const deadline = new Promise(resolve => {
        timer = setTimeout(() => {
          timedOut = true;
          stop();
          resolve(failed('TIMEOUT'));
        }, timeoutMs);
      });
      const consume = async () => {
        const chunks = [];
        let length = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (timedOut) return failed('TIMEOUT');
          if (done) break;
          length += value.byteLength;
          if (length > limit) {
            stop();
            return failed('TOO_LARGE');
          }
          chunks.push(value);
        }
        let binary = '';
        for (const chunk of chunks) {
          for (let offset = 0; offset < chunk.length; offset += 16384)
            binary += String.fromCharCode(...chunk.subarray(offset, offset + 16384));
        }
        return { ok: true, base64: btoa(binary), bytes: length };
      };
      return await Promise.race([consume().catch(() => failed('FAILED')), deadline]);
    } catch {
      return failed('FAILED');
    } finally {
      clearTimeout(timer);
    }
  }

  function capture(response, limit, prefix) {
    const record = { phase: 'pending' };
    record.promise = boundedClone(response, limit, prefix).then(result => {
      Object.assign(record, result, { phase: 'settled' });
      return result;
    });
    return record;
  }

  function resultCapture(url, createRecord) {
    if (state.results.has(url)) {
      state.duplicateResults.add(url);
      return;
    }
    if (state.resultCaptureCount >= 4) {
      state.resultLimitReached = true;
      return;
    }
    state.resultCaptureCount++;
    state.results.set(url, createRecord());
  }

  globalThis.fetch = async (...args) => {
    const [input, init] = args;
    let url, method;
    try {
      url = new URL(input instanceof Request ? input.url : String(input), pageOrigin).href;
      method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    } catch {
      return nativeFetch(...args);
    }
    const generation = method === 'POST' && url === generationUrl;
    if (generation) state.armed = true;
    let response;
    try {
      response = await nativeFetch(...args);
    } catch (error) {
      const failed = {
        phase: 'settled',
        ok: false,
        code: generation ? 'GENERATION_FETCH_FAILED' : 'RESULT_FETCH_FAILED'
      };
      if (generation) state.generation = failed;
      else if (state.armed && method === 'GET' && url.startsWith('https:')) resultCapture(url, () => failed);
      throw error;
    }
    if (generation) {
      state.generation = capture(response, generationLimit, 'GENERATION');
      return response;
    }
    if (!state.armed || method !== 'GET' || !url.startsWith('https:')) return response;
    resultCapture(url, () => capture(response, resultLimit, 'RESULT'));
    return response;
  };
}
