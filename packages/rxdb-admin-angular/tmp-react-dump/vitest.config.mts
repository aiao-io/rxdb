import react from '@vitejs/plugin-react';

export default {
  root: import.meta.dirname,
  plugins: [react()],
  resolve: { tsconfigPaths: true, conditions: ['@aiao/source'] },
  test: { name: 'react-dump', watch: false, globals: true, environment: 'happy-dom', include: ['react-dump.spec.tsx'], coverage: { enabled: false } }
};
