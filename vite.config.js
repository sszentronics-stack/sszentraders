import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['backend/lib/**/*.test.ts', 'backend/services/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
