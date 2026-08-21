import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Edge Functions import zod via npm: for Deno deploy; Vite maps it back.
      'npm:zod@4.4.3': 'zod',
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['backend/lib/**/*.test.ts', 'backend/services/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
