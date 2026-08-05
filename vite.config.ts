import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // GitHub Pages sert un dépôt de projet sous /<nom-du-depot>/.
  // VITE_BASE_PATH est renseigné par le workflow de déploiement ; en local
  // on reste à la racine pour que `npm run dev` fonctionne sans réglage.
  const base = env.VITE_BASE_PATH || '/'

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          // Découpage manuel : le formulaire public ne doit pas embarquer
          // les graphiques ni les librairies d'export de l'espace permanent.
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
            charts: ['recharts'],
          },
        },
      },
    },
  }
})
