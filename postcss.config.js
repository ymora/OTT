// Configuration PostCSS pour Tailwind CSS
// Détection automatique de la version de Tailwind installée
let tailwindPlugin = 'tailwindcss'

try {
  // Essayer d'utiliser @tailwindcss/postcss si disponible (Tailwind v4)
  require.resolve('@tailwindcss/postcss')
  tailwindPlugin = '@tailwindcss/postcss'
  console.log('[PostCSS] Utilisation de @tailwindcss/postcss (Tailwind v4)')
} catch (e) {
  // Utiliser tailwindcss classique (Tailwind v3)
  console.log('[PostCSS] Utilisation de tailwindcss (Tailwind v3)')
}

module.exports = {
  plugins: {
    [tailwindPlugin]: {},
    autoprefixer: {},
  },
}