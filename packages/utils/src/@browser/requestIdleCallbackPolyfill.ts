export const requestIdleCallbackPolyfill = () => {
  window.requestIdleCallback =
    window.requestIdleCallback ||
    (cb => {
      const start = Date.now();
      return setTimeout(() => {
        cb({
          didTimeout: false,
          timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
        });
      }, 0);
    });
  window.cancelIdleCallback = window.cancelIdleCallback || (id => clearTimeout(id));
};
