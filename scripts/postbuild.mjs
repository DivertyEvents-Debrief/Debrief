/**
 * Adaptations GitHub Pages, exécutées après `vite build`.
 *
 *  1. 404.html — Pages ne connaît pas les routes du navigateur. Ouvrir
 *     directement /espace/debriefings renverrait une erreur ; en servant
 *     l'application depuis la page 404, le routeur reprend la main et
 *     affiche le bon écran. C'est la façon standard d'héberger une SPA ici.
 *  2. .nojekyll — sans ce fichier, Pages ignore les dossiers commençant
 *     par un tiret bas.
 */
import { copyFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(process.cwd(), 'dist')

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html introuvable : lancez `vite build` avant.')
  process.exit(1)
}

copyFileSync(join(dist, 'index.html'), join(dist, '404.html'))
writeFileSync(join(dist, '.nojekyll'), '')

console.log('Post-build : 404.html et .nojekyll ajoutés.')
