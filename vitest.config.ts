import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/__tests__/setup.ts'],
    // worktrees/ est un worktree git imbriqué et gitignoré (autre branche) : ses fichiers de test
    // sont des copies qui résolvent `@/` vers le src/ de la racine — les exécuter ferait tourner
    // la suite d'une autre branche contre ce code.
    exclude: ['**/node_modules/**', '**/e2e/**', '**/worktrees/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
