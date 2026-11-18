import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Expone también las variables que empiezan con `key_` (p. ej. key_rutas).
  envPrefix: ['VITE_', 'key_'],
})
