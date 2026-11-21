module.exports = {
  '/collaboration-api/**': { target: process.env['ADMIN_API_URL'] ?? 'http://127.0.0.1:8088', changeOrigin: true }
};
