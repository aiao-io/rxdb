const target = process.env.MODEL_DESIGN_API_URL || 'http://127.0.0.1:8788';

function configure(proxy, options) {
  proxy.on('proxyReq', (outgoing, incoming) => {
    const protocol = incoming.socket.encrypted ? 'https' : 'http';
    if (incoming.headers.origin === `${protocol}://${incoming.headers.host}`) {
      outgoing.setHeader('origin', new URL(options.target).origin);
    }
  });
}

module.exports = {
  '/api/**': { target, secure: false, changeOrigin: true, configure },
  '/bff/**': { target, secure: false, changeOrigin: true, configure }
};
