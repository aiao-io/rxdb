const target = process.env.MODEL_DESIGN_API_URL || 'http://localhost:3200';
module.exports = {
  '/api/**': { target, secure: false, changeOrigin: true },
  '/bff/**': { target, secure: false, changeOrigin: true }
};
