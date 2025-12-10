'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { withBasePath } from '@/lib/utils'
import logger from '@/lib/logger'
import { useAuth } from '@/contexts/AuthContext'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import MetadataCard from '@/components/MetadataCard'
import DayDetailsModal from '@/components/DayDetailsModal'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const DOCUMENTATION_FILES = {
  presentation: 'DOCUMENTATION_PRESENTATION.html',
  developpeurs: 'DOCUMENTATION_DEVELOPPEURS.html',
  commerciale: 'DOCUMENTATION_COMMERCIALE.html',
  'suivi-temps': 'SUIVI_TEMPS_FACTURATION.md',
  database: null // Géré par un composant spécial
}

export default function DocumentationPage() {
  const searchParams = useSearchParams()
  const docType = searchParams.get('doc') || 'presentation'
  
  const docUrl = useMemo(() => {
    const fileName = DOCUMENTATION_FILES[docType] || DOCUMENTATION_FILES.presentation
    // Si c'est un fichier markdown, on l'affiche différemment
    if (fileName.endsWith('.md')) {
      return null // On gérera ça avec un composant spécial
    }
    return withBasePath(`/docs/${fileName}`)
  }, [docType])

  useEffect(() => {
    // Mettre à jour le titre selon le type de documentation
    const titles = {
      presentation: 'Documentation Présentation - OTT Dashboard',
      developpeurs: 'Documentation Développeurs - OTT Dashboard',
      commerciale: 'Documentation Commerciale - OTT Dashboard',
      'suivi-temps': 'Suivi Temps - OTT Dashboard'
    }
    document.title = titles[docType] || titles.presentation
  }, [docType])

  const isMarkdownDoc = docType === 'suivi-temps'
  const isDatabaseDoc = docType === 'database'

  // Référence à l'iframe pour envoyer le thème
  const iframeRef = useRef(null)

  // Fonction pour envoyer le thème à l'iframe
  const sendThemeToIframe = useCallback(() => {
    if (isMarkdownDoc || !iframeRef.current?.contentWindow) {
      return
    }
    try {
      const isDarkMode = document.documentElement.classList.contains('dark')
      iframeRef.current.contentWindow.postMessage({ type: 'theme', isDark: isDarkMode }, '*')
    } catch (error) {
      logger.error('Erreur envoi thème à iframe:', error)
    }
  }, [isMarkdownDoc])

  // Détecter le thème actuel et observer les changements
  useEffect(() => {
    if (isMarkdownDoc) {
      return
    }
    
    // Écouter les demandes de thème depuis l'iframe
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'request-theme') {
        sendThemeToIframe()
      }
    }
    window.addEventListener('message', handleMessage)
    
    // Envoyer le thème immédiatement
    sendThemeToIframe()

    // Observer les changements de thème
    const observer = new MutationObserver(sendThemeToIframe)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })

    return () => {
      observer.disconnect()
      window.removeEventListener('message', handleMessage)
    }
  }, [sendThemeToIframe, isMarkdownDoc])

  // Si c'est un fichier markdown, on affiche un composant spécial
  if (isMarkdownDoc) {
    return <MarkdownViewer key={docType} fileName="SUIVI_TEMPS_FACTURATION.md" />
  }

  // Si c'est la base de données, on affiche un composant spécial
  if (isDatabaseDoc) {
    return <DatabaseViewer />
  }

  return (
    <div className="fixed inset-0 top-16 left-64 right-0 bottom-0 -m-6 overflow-y-auto docs-scrollbar">
      <iframe
        ref={iframeRef}
        src={docUrl}
        className="w-full h-full border-0"
        title="Documentation OTT"
        allow="fullscreen"
        onLoad={() => {
          // Envoyer le thème avec plusieurs tentatives pour s'assurer que le script est prêt
          const sendWithRetry = () => {
            sendThemeToIframe()
          }
          sendWithRetry() // Immédiatement
          // Utiliser des timeouts (pas besoin de cleanup car iframe reste monté pendant la vie du composant)
          setTimeout(sendWithRetry, 100) // Après 100ms
          setTimeout(sendWithRetry, 500) // Après 500ms
        }}
      />
    </div>
  )
}

// Composant pour afficher le markdown avec graphiques
function MarkdownViewer({ fileName }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState(null)
  const [timeView, setTimeView] = useState('day') // 'day', 'week', 'month'
  const [regenerating, setRegenerating] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { fetchWithAuth, API_URL } = useAuth()
  
  // Ref pour éviter les rechargements multiples du même fichier
  const loadedFileNameRef = useRef(null)
  const isLoadingRef = useRef(false)
  const hasRegeneratedRef = useRef(false)
  const lastRegenerationTimeRef = useRef(0)
  
  // Fonction pour ouvrir la modal de détails
  const openDayDetails = useCallback((day) => {
    setSelectedDay(day)
    setIsModalOpen(true)
  }, [])
  
  // Fonction pour fermer la modal
  const closeDayDetails = useCallback(() => {
    setIsModalOpen(false)
    setSelectedDay(null)
  }, [])
  
  // Détecter le thème pour le MarkdownViewer (4ème doc - Suivi Temps)
  useEffect(() => {
    const checkTheme = () => {
      const isDarkMode = document.documentElement.classList.contains('dark')
      const container = document.getElementById('markdown-viewer-container')
      if (container) {
        if (isDarkMode) {
          container.classList.add('dark')
        } else {
          container.classList.remove('dark')
        }
      }
    }
    
    // Vérifier immédiatement
    checkTheme()
    
    // Observer les changements de thème
    const observer = new MutationObserver(checkTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })
    
    return () => observer.disconnect()
  }, [])

  // Fonction pour recharger le contenu
  const reloadContent = useCallback(async () => {
    if (isLoadingRef.current) {
      return
    }
    
    isLoadingRef.current = true
    setLoading(true)
    
    try {
      let text = ''
      let lastError = null
      
      // Détecter le basePath depuis window.location ou process.env
      const detectBasePath = () => {
        // En mode statique (GitHub Pages), détecter depuis l'URL
        if (typeof window !== 'undefined') {
          const pathname = window.location.pathname
          const origin = window.location.origin
          // Si on est sur /OTT/..., le basePath est /OTT
          if (pathname.startsWith('/OTT/')) {
            return '/OTT'
          }
          // Détecter aussi depuis l'hostname GitHub Pages
          if (origin.includes('github.io')) {
            // Sur GitHub Pages, si l'URL contient /OTT, c'est le basePath
            if (pathname.includes('/OTT')) {
              return '/OTT'
            }
            // Sinon, vérifier depuis l'origine (ymora.github.io/OTT)
            if (origin.includes('ymora.github.io')) {
              return '/OTT'
            }
          }
        }
        // Sinon, utiliser la variable d'environnement (injectée au build)
        return process.env.NEXT_PUBLIC_BASE_PATH || ''
      }
      
      const basePath = detectBasePath()
      
      // Logger pour debug (uniquement si on est sur GitHub Pages)
      if (typeof window !== 'undefined' && window.location.origin.includes('github.io')) {
        logger.debug('[SUIVI_TEMPS] BasePath détecté:', basePath)
        logger.debug('[SUIVI_TEMPS] URL actuelle:', window.location.href)
        logger.debug('[SUIVI_TEMPS] Pathname:', window.location.pathname)
      }
      
      // Essayer plusieurs méthodes de chargement avec différents chemins
      const methods = [
        // 1. Essayer depuis la racine avec basePath (pour GitHub Pages) - Format: /OTT/SUIVI_TEMPS_FACTURATION.md
        async () => {
          const url = basePath ? `${basePath}/${fileName}` : `/${fileName}`
          const response = await fetch(url + '?t=' + Date.now())
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const content = await response.text()
          if (!content || content.trim().length === 0) throw new Error('Fichier vide')
          return content
        },
        // 2. Essayer avec withBasePath (utilise process.env.NEXT_PUBLIC_BASE_PATH)
        async () => {
          const url = withBasePath(`/${fileName}`)
          const response = await fetch(url + '?t=' + Date.now())
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const content = await response.text()
          if (!content || content.trim().length === 0) throw new Error('Fichier vide')
          return content
        },
        // 3. Essayer depuis la racine sans basePath (fallback local)
        async () => {
          const url = `/${fileName}`
          const response = await fetch(url + '?t=' + Date.now())
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const content = await response.text()
          if (!content || content.trim().length === 0) throw new Error('Fichier vide')
          return content
        },
        // 4. Essayer avec basePath mais sans slash initial (format alternatif)
        async () => {
          if (!basePath) throw new Error('Pas de basePath')
          const url = `${basePath}${fileName.startsWith('/') ? fileName : '/' + fileName}`
          const response = await fetch(url + '?t=' + Date.now())
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const content = await response.text()
          if (!content || content.trim().length === 0) throw new Error('Fichier vide')
          return content
        },
        // 5. Essayer depuis l'API (uniquement si pas en mode statique)
        async () => {
          // En mode statique (GitHub Pages), l'API n'est pas accessible
          if (typeof window !== 'undefined' && window.location.origin.includes('github.io')) {
            throw new Error('API non disponible sur GitHub Pages')
          }
          const apiUrl = API_URL || 'https://ott-jbln.onrender.com'
          const response = await fetch(`${apiUrl}/api.php/docs/${fileName}?t=${Date.now()}`)
          if (!response.ok) throw new Error(`API HTTP ${response.status}`)
          const content = await response.text()
          if (!content || content.trim().length === 0) throw new Error('Fichier vide')
          return content
        }
      ]
      
      // Essayer chaque méthode jusqu'à ce qu'une fonctionne
      const attemptedUrls = []
      for (let i = 0; i < methods.length; i++) {
        try {
          text = await methods[i]()
          if (text && text.trim().length > 0) {
            break // Succès, sortir de la boucle
          }
        } catch (err) {
          lastError = err
          // Logger l'URL tentée pour debug (même en production pour diagnostiquer)
          if (err.message.includes('HTTP') || err.message.includes('API')) {
            attemptedUrls.push(`Méthode ${i + 1}: ${err.message}`)
          }
          continue // Essayer la méthode suivante
        }
      }
      
      if (!text) {
        const errorDetails = attemptedUrls.length > 0 
          ? `\n\nURLs tentées:\n${attemptedUrls.join('\n')}\n\nBasePath détecté: "${basePath}"\nURL actuelle: ${typeof window !== 'undefined' ? window.location.href : 'N/A'}`
          : ''
        throw new Error(
          `Impossible de charger ${fileName}. ` +
          `Vérifiez que le fichier existe dans public/ ou que l'API est accessible. ` +
          `Dernière erreur: ${lastError?.message || 'Inconnue'}` +
          errorDetails
        )
      }
      
      setContent(text)
      // Parser les données pour les graphiques
      const parsed = parseMarkdownForCharts(text)
      setChartData(parsed)
    } catch (error) {
      logger.error('Erreur chargement markdown:', error)
      setContent(`# Erreur de chargement\n\nImpossible de charger le document **${fileName}**.\n\n**Détails :** ${error.message}\n\n**Solutions possibles :**\n- Vérifiez que le fichier existe dans le dossier \`public/\`\n- Vérifiez que l'API backend est accessible\n- Vérifiez votre connexion réseau`)
    } finally {
      setLoading(false)
      isLoadingRef.current = false
    }
  }, [fileName])

  // Fonction pour régénérer le fichier de suivi du temps
  const regenerateTimeTracking = useCallback(async (force = false) => {
    if (fileName !== 'SUIVI_TEMPS_FACTURATION.md') {
      return
    }
    
    if (regenerating && !force) {
      return
    }
    
    setRegenerating(true)
    try {
      logger.debug('🔄 Régénération du fichier de suivi du temps...')
      
      const regenerateResponse = await fetchWithAuth(
        `${API_URL}/api.php/docs/regenerate-time-tracking`,
        { method: 'POST' },
        { requiresAuth: true }
      )
      
      if (regenerateResponse.ok) {
        const regenerateData = await regenerateResponse.json()
        logger.debug('✅ Fichier régénéré avec succès:', regenerateData)
        // Mettre à jour le timestamp de dernière régénération
        lastRegenerationTimeRef.current = Date.now()
        // Attendre un peu pour que le fichier soit écrit
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Recharger le contenu après régénération
        await reloadContent()
      } else {
        // Vérifier si c'est une erreur 501 (non disponible sur cette plateforme)
        if (regenerateResponse.status === 501) {
          const errorData = await regenerateResponse.json().catch(() => ({}))
          logger.debug('ℹ️ Régénération automatique non disponible sur ce serveur (non-Windows). Le fichier existant sera utilisé.')
          // Ne pas lancer d'erreur, simplement ignorer et continuer avec le fichier existant
          return
        }
        
        // Autre erreur
        const errorData = await regenerateResponse.json().catch(() => ({}))
        logger.warn('⚠️ Erreur lors de la régénération:', errorData)
        // Ne pas bloquer : on continue avec le fichier existant
        return
      }
    } catch (error) {
      // Erreur réseau ou autre : ne pas bloquer, simplement logger
      logger.debug('ℹ️ Régénération non disponible (non bloquant):', error.message)
      // Ne pas lancer l'erreur, continuer avec le fichier existant
      return
    } finally {
      setRegenerating(false)
    }
  }, [fileName, API_URL, fetchWithAuth, regenerating, reloadContent])

  useEffect(() => {
    // Réinitialiser les refs quand le fileName change (nouveau composant monté)
    if (loadedFileNameRef.current !== fileName) {
      loadedFileNameRef.current = fileName
      hasRegeneratedRef.current = false
      lastRegenerationTimeRef.current = 0
    }
    
    // Ne charger que si on n'est pas déjà en train de charger
    if (isLoadingRef.current) {
      return
    }
    
    const loadMarkdown = async () => {
      // Régénération automatique désactivée - le script peut être exécuté manuellement via: pwsh scripts/generate_time_tracking.ps1
      // Code conservé pour référence:
      /*
      // Si c'est le fichier de suivi du temps, régénérer automatiquement au chargement
      // Mais seulement si ça fait plus de 15 minutes depuis la dernière régénération
      if (fileName === 'SUIVI_TEMPS_FACTURATION.md') {
        const now = Date.now()
        const timeSinceLastRegen = now - lastRegenerationTimeRef.current
        const MIN_REGENERATION_INTERVAL = 15 * 60 * 1000 // 15 minutes
        
        // Régénérer si c'est la première fois ou si ça fait plus de 15 minutes
        if (!hasRegeneratedRef.current || timeSinceLastRegen > MIN_REGENERATION_INTERVAL) {
          hasRegeneratedRef.current = true
          lastRegenerationTimeRef.current = now
          logger.debug('🔄 Tentative de régénération automatique du suivi de temps au chargement de la page...')
          // Ne pas attendre le résultat, continuer le chargement en parallèle
          regenerateTimeTracking().catch((regenerateError) => {
            // Non bloquant : on continue même si la régénération échoue
            logger.debug('ℹ️ Régénération automatique non disponible ou échouée (non bloquant):', regenerateError?.message || 'Erreur inconnue')
          })
        } else {
          logger.debug(`⏭️ Régénération ignorée (dernière régénération il y a ${Math.round(timeSinceLastRegen / 1000)}s)`)
        }
      }
      */
      
      // Charger le contenu
      await reloadContent()
    }
    
    loadMarkdown()
  }, [fileName, regenerateTimeTracking, reloadContent])

  // Fonctions utilitaires pour parsing robuste
  function safeParseFloat(value, defaultValue = 0) {
    if (!value || value === '-' || value === '' || value === '0') return defaultValue
    const parsed = parseFloat(value)
    return isNaN(parsed) ? defaultValue : parsed
  }

  function safeParseInt(value, defaultValue = 0) {
    if (!value || value === '-' || value === '' || value === '0') return defaultValue
    const parsed = parseInt(value)
    return isNaN(parsed) ? defaultValue : parsed
  }

  // Fonction pour parser le markdown et extraire les données pour les graphiques (VERSION AMÉLIORÉE)
  function parseMarkdownForCharts(md) {
    const data = {
      metadata: null,
      dailyData: [],
      categories: {
        'Développement': 0,
        'Correction': 0,
        'Test': 0,
        'Documentation': 0,
        'Refactoring': 0,
        'Déploiement': 0,
        'UI/UX': 0,
        'Optimisation': 0
      },
      totalHours: 0,
      totalCommits: 0,
      totalHoursFromMarkdown: 0,
      totalCommitsFromMarkdown: 0,
      validation: {
        hoursMatch: true,
        commitsMatch: true,
        categoriesMatch: true
      }
    }

    // ============================================
    // PHASE 1.1 : Extraction des métadonnées
    // ============================================
    const metadata = {}
    
    // Période analysée
    const periodMatch = md.match(/\*\*Période analysée\*\* : (\d{4}-\d{2}-\d{2}) - (\d{4}-\d{2}-\d{2})/)
    if (periodMatch) {
      metadata.period = {
        start: periodMatch[1],
        end: periodMatch[2]
      }
    }

    // Développeur
    const authorMatch = md.match(/\*\*Développeur\*\* : (.+)/)
    if (authorMatch) {
      metadata.author = authorMatch[1].trim()
    }

    // Projet
    const projectMatch = md.match(/\*\*Projet\*\* : (.+)/)
    if (projectMatch) {
      metadata.project = projectMatch[1].trim()
    }

    // Total commits
    const totalCommitsMatch = md.match(/\*\*Total commits analysés\*\* : (\d+)/)
    if (totalCommitsMatch) {
      metadata.totalCommits = parseInt(totalCommitsMatch[1])
    }

    // Branches analysées
    const branchesMatch = md.match(/\*\*Branches analysées\*\* : (.+)/)
    if (branchesMatch) {
      metadata.branchesAnalyzed = branchesMatch[1].trim()
    }

    // Filtres
    metadata.filters = {}
    const authorFilterMatch = md.match(/\*\*Auteur filtré\*\* : (.+)/)
    if (authorFilterMatch) {
      metadata.filters.author = authorFilterMatch[1].trim()
    }

    const sinceMatch = md.match(/\*\*Depuis\*\* : (.+)/)
    if (sinceMatch) {
      metadata.filters.since = sinceMatch[1].trim()
    }

    const untilMatch = md.match(/\*\*Jusqu'à\*\* : (.+)/)
    if (untilMatch) {
      metadata.filters.until = untilMatch[1].trim()
    }

    // Dernière génération
    const lastGenMatch = md.match(/\*\*Dernière génération\*\* : (.+)/)
    if (lastGenMatch) {
      metadata.lastGenerated = lastGenMatch[1].trim()
    }

    if (Object.keys(metadata).length > 0) {
      data.metadata = metadata
    }

    // ============================================
    // PHASE 1.2 : Parsing robuste du tableau (avec UI/UX et Optimisation)
    // ============================================
    const tableRegex = /\| (\d{4}-\d{2}-\d{2}) \| ~?([\d.]+)h? \| (\d+) \| ([\d.-]+) \| ([\d.-]+) \| ([\d.-]+) \| ([\d.-]+) \| ([\d.-]+) \| ([\d.-]+) \| ([\d.-]+) \| ([\d.-]+) \|/g
    let match
    while ((match = tableRegex.exec(md)) !== null) {
      const date = match[1]
      const hours = safeParseFloat(match[2])
      const commits = safeParseInt(match[3])
      const dev = safeParseFloat(match[4])
      const fix = safeParseFloat(match[5])
      const test = safeParseFloat(match[6])
      const doc = safeParseFloat(match[7])
      const refactor = safeParseFloat(match[8])
      const deploy = safeParseFloat(match[9])
      const uiux = safeParseFloat(match[10])
      const optim = safeParseFloat(match[11])

      // Ignorer la ligne de séparation (---) ou lignes invalides
      if (date.includes('---') || !date.match(/^\d{4}-\d{2}-\d{2}$/)) continue

      data.      dailyData.push({
        date,
        hours,
        commits,
        dev,
        fix,
        test,
        doc,
        refactor,
        deploy,
        uiux,
        optim,
        details: null // Sera rempli par la phase 1.3
      })

      data.totalHours += hours
      data.totalCommits += commits
    }

    // ============================================
    // PHASE 3 : Utiliser les totaux du markdown comme source unique (avec UI/UX et Optimisation)
    // ============================================
    // Essayer plusieurs formats de regex pour la ligne Total
    const totalMatchPatterns = [
      // Format avec **Total** et valeurs en gras
      /(?:\*\*)?Total(?:\*\*)?\s*\|\s*(?:\*\*)?~?([\d.]+)h?(?:\*\*)?\s*\|\s*(?:\*\*)?(\d+)(?:\*\*)?\s*\|\s*(?:\*\*)?([\d.]+)(?:\*\*)?\s*\|\s*(?:\*\*)?([\d.]+)(?:\*\*)?\s*\|\s*(?:\*\*)?([\d.]+)(?:\*\*)?\s*\|\s*(?:\*\*)?([\d.]+)(?:\*\*)?\s*\|\s*(?:\*\*)?([\d.]+)(?:\*\*)?\s*\|\s*(?:\*\*)?([\d.]+)(?:\*\*)?\s*\|\s*(?:\*\*)?([\d.]+)(?:\*\*)?\s*\|\s*(?:\*\*)?([\d.]+)(?:\*\*)?\s*\|\s*(?:\*\*)?([\d.]+)(?:\*\*)?/,
      // Format simple sans gras
      /Total\s*\|\s*~?([\d.]+)h?\s*\|\s*(\d+)\s*\|\s*([\d.-]+)\s*\|\s*([\d.-]+)\s*\|\s*([\d.-]+)\s*\|\s*([\d.-]+)\s*\|\s*([\d.-]+)\s*\|\s*([\d.-]+)\s*\|\s*([\d.-]+)\s*\|\s*([\d.-]+)/
    ]
    
    let totalMatch = null
    for (const pattern of totalMatchPatterns) {
      totalMatch = md.match(pattern)
      if (totalMatch) break
    }
    
    if (totalMatch) {
      // Utiliser les totaux du markdown comme source de vérité
      data.totalHoursFromMarkdown = safeParseFloat(totalMatch[1])
      data.totalCommitsFromMarkdown = safeParseInt(totalMatch[2])
      
      // Utiliser ces valeurs comme totaux principaux
      data.totalHours = data.totalHoursFromMarkdown
      data.totalCommits = data.totalCommitsFromMarkdown

      // Catégories depuis le markdown (8 catégories au lieu de 6)
      data.categories['Développement'] = safeParseFloat(totalMatch[3])
      data.categories['Correction'] = safeParseFloat(totalMatch[4])
      data.categories['Test'] = safeParseFloat(totalMatch[5])
      data.categories['Documentation'] = safeParseFloat(totalMatch[6])
      data.categories['Refactoring'] = safeParseFloat(totalMatch[7])
      data.categories['Déploiement'] = safeParseFloat(totalMatch[8])
      data.categories['UI/UX'] = safeParseFloat(totalMatch[9])
      data.categories['Optimisation'] = safeParseFloat(totalMatch[10])

      // Validation : comparer calculé vs parsé
      const calculatedHours = data.dailyData.reduce((sum, d) => sum + d.hours, 0)
      const calculatedCommits = data.dailyData.reduce((sum, d) => sum + d.commits, 0)
      const hoursDiff = Math.abs(calculatedHours - data.totalHoursFromMarkdown)
      const commitsDiff = Math.abs(calculatedCommits - data.totalCommitsFromMarkdown)
      
      data.validation.hoursMatch = hoursDiff < 0.1
      data.validation.commitsMatch = commitsDiff === 0
      
      if (!data.validation.hoursMatch) {
        logger.warn(`Écart détecté pour les heures: calculé=${calculatedHours.toFixed(1)}, markdown=${data.totalHoursFromMarkdown.toFixed(1)}`)
      }
      if (!data.validation.commitsMatch) {
        logger.warn(`Écart détecté pour les commits: calculé=${calculatedCommits}, markdown=${data.totalCommitsFromMarkdown}`)
      }
    } else {
      // Fallback : calculer les catégories depuis les données quotidiennes si le regex ne match pas
      logger.debug('⚠️ Ligne Total non trouvée dans le markdown, calcul des catégories depuis les données quotidiennes')
      data.categories['Développement'] = data.dailyData.reduce((sum, d) => sum + (d.dev || 0), 0)
      data.categories['Correction'] = data.dailyData.reduce((sum, d) => sum + (d.fix || 0), 0)
      data.categories['Test'] = data.dailyData.reduce((sum, d) => sum + (d.test || 0), 0)
      data.categories['Documentation'] = data.dailyData.reduce((sum, d) => sum + (d.doc || 0), 0)
      data.categories['Refactoring'] = data.dailyData.reduce((sum, d) => sum + (d.refactor || 0), 0)
      data.categories['Déploiement'] = data.dailyData.reduce((sum, d) => sum + (d.deploy || 0), 0)
      data.categories['UI/UX'] = data.dailyData.reduce((sum, d) => sum + (d.uiux || 0), 0)
      data.categories['Optimisation'] = data.dailyData.reduce((sum, d) => sum + (d.optim || 0), 0)
    }

    // ============================================
    // PHASE 1.3 : Parser la section Détail par Jour
    // ============================================
    const detailSectionRegex = /### (\d{1,2} \w+ \d{4})\s+[\s\S]*?(?=###|$)/g
    let detailMatch
    
    while ((detailMatch = detailSectionRegex.exec(md)) !== null) {
      const sectionContent = detailMatch[0]
      const dateHeader = detailMatch[1]
      
      // Extraire la date du header (format: "14 novembre 2025")
      let dayDate = null
      try {
        // Convertir "14 novembre 2025" en "2025-11-14"
        const dateParts = dateHeader.match(/(\d{1,2}) (\w+) (\d{4})/)
        if (dateParts) {
          const day = parseInt(dateParts[1])
          const monthName = dateParts[2].toLowerCase()
          const year = parseInt(dateParts[3])
          
          const monthMap = {
            'janvier': 0, 'février': 1, 'mars': 2, 'avril': 3, 'mai': 4, 'juin': 5,
            'juillet': 6, 'août': 7, 'septembre': 8, 'octobre': 9, 'novembre': 10, 'décembre': 11
          }
          
          const month = monthMap[monthName]
          if (month !== undefined) {
            const date = new Date(year, month, day)
            dayDate = date.toISOString().split('T')[0] // Format YYYY-MM-DD
          }
        }
      } catch (e) {
        logger.warn('Erreur parsing date détail:', e)
      }

      if (!dayDate) continue

      // Trouver le jour correspondant dans dailyData
      const dayIndex = data.dailyData.findIndex(d => d.date === dayDate)
      if (dayIndex === -1) continue

      const details = {
        advances: [],
        fixes: [],
        deployments: [],
        tests: []
      }

      // Extraire les avancées principales
      const advancesMatch = sectionContent.match(/#### Avancées principales\s+([\s\S]*?)(?=####|$)/)
      if (advancesMatch) {
        const advancesText = advancesMatch[1]
        const advanceLines = advancesText.match(/- \[FEAT\] (.+)/g)
        if (advanceLines) {
          details.advances = advanceLines.map(line => line.replace(/- \[FEAT\] /, '').trim())
        }
      }

      // Extraire les problèmes résolus
      const fixesMatch = sectionContent.match(/#### Problèmes résolus\s+([\s\S]*?)(?=####|$)/)
      if (fixesMatch) {
        const fixesText = fixesMatch[1]
        const fixLines = fixesText.match(/- \[FIX\] (.+)/g)
        if (fixLines) {
          details.fixes = fixLines.map(line => line.replace(/- \[FIX\] /, '').trim())
        }
      }

      // Extraire les redéploiements
      const deploymentsMatch = sectionContent.match(/#### Redéploiements\s+([\s\S]*?)(?=####|$)/)
      if (deploymentsMatch) {
        const deploymentsText = deploymentsMatch[1]
        const deployLines = deploymentsText.match(/- \[DEPLOY\] (.+)/g)
        if (deployLines) {
          details.deployments = deployLines.map(line => line.replace(/- \[DEPLOY\] /, '').trim())
        }
      }

      // Extraire les tests
      const testsMatch = sectionContent.match(/#### Tests\s+([\s\S]*?)(?=####|$)/)
      if (testsMatch) {
        const testsText = testsMatch[1]
        const testLines = testsText.match(/- \[TEST\] (.+)/g)
        if (testLines) {
          details.tests = testLines.map(line => line.replace(/- \[TEST\] /, '').trim())
        }
      }

      // Ajouter les détails au jour correspondant
      if (details.advances.length > 0 || details.fixes.length > 0 || 
          details.deployments.length > 0 || details.tests.length > 0) {
        data.dailyData[dayIndex].details = details
      }
    }

    // Trier par date croissante (premier jour en premier, dernier à droite)
    data.dailyData.sort((a, b) => new Date(a.date) - new Date(b.date))
    
    return data
  }

  // Fonction pour agréger les données par semaine
  function aggregateByWeek(dailyData) {
    const weeks = {}
    dailyData.forEach(day => {
      const date = new Date(day.date)
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay()) // Dimanche de la semaine
      const weekKey = weekStart.toISOString().split('T')[0]
      
      if (!weeks[weekKey]) {
        weeks[weekKey] = {
          date: weekKey,
          label: `Sem. ${weekStart.getDate()}/${weekStart.getMonth() + 1}`,
          hours: 0,
          commits: 0,
          days: 0
        }
      }
      weeks[weekKey].hours += day.hours
      weeks[weekKey].commits += day.commits
      weeks[weekKey].days += 1
    })
    return Object.values(weeks).sort((a, b) => new Date(a.date) - new Date(b.date))
  }

  // Fonction pour agréger les données par mois
  function aggregateByMonth(dailyData) {
    const months = {}
    dailyData.forEach(day => {
      const date = new Date(day.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      
      if (!months[monthKey]) {
        months[monthKey] = {
          date: monthKey,
          label: date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
          hours: 0,
          commits: 0,
          days: 0
        }
      }
      months[monthKey].hours += day.hours
      months[monthKey].commits += day.commits
      months[monthKey].days += 1
    })
    return Object.values(months).sort((a, b) => new Date(a.date) - new Date(b.date))
  }

  // Préparer les données selon la vue sélectionnée - MÉMORISÉ pour éviter les recalculs
  const displayData = useMemo(() => {
    if (!chartData) return null
    
    switch (timeView) {
      case 'week':
        return aggregateByWeek(chartData.dailyData)
      case 'month':
        return aggregateByMonth(chartData.dailyData)
      default:
        return chartData.dailyData
    }
  }, [chartData, timeView])

  // Convertir markdown basique en HTML (version améliorée)
  const convertMarkdown = (md) => {
    let html = md
    
    // Tables (doit être fait avant les autres remplacements)
    const lines = html.split('\n')
    let inTable = false
    let tableRows = []
    let result = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const isTableRow = line.trim().startsWith('|') && line.trim().endsWith('|')
      const isTableSeparator = isTableRow && line.includes('---')
      
      if (isTableRow && !isTableSeparator) {
        if (!inTable) {
          inTable = true
          tableRows = []
        }
        const cells = line.split('|').map(c => c.trim()).filter(c => c)
        tableRows.push(cells)
      } else if (isTableSeparator) {
        // Ignorer la ligne de séparation
        continue
      } else {
        if (inTable && tableRows.length > 0) {
          // Fermer le tableau
          result.push('<div class="overflow-x-auto my-6"><table class="min-w-full border-collapse border border-gray-300 dark:border-gray-600 shadow-sm">')
          tableRows.forEach((row, idx) => {
            const tag = idx === 0 ? 'th' : 'td'
            const cellClass = idx === 0 
              ? 'px-4 py-3 border border-gray-300 dark:border-gray-600 bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-700 font-bold text-left text-gray-900 dark:text-gray-100' 
              : 'px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
            result.push(`<tr class="${idx % 2 === 0 ? 'bg-white dark:bg-[rgb(var(--night-surface))]' : 'bg-gray-50 dark:bg-gray-900/50'}">`)
            row.forEach(cell => {
              // Détecter si c'est une cellule avec du texte en gras (Total, etc.)
              const isBold = cell.includes('**')
              const cellContent = cell.replace(/\*\*/g, '')
              const finalClass = isBold ? cellClass + ' font-bold' : cellClass
              result.push(`<${tag} class="${finalClass}">${cellContent}</${tag}>`)
            })
            result.push(`</tr>`)
          })
          result.push('</table></div>')
          tableRows = []
          inTable = false
        }
        result.push(line)
      }
    }
    
    if (inTable && tableRows.length > 0) {
      result.push('<div class="overflow-x-auto my-6"><table class="min-w-full border-collapse border border-gray-300 dark:border-gray-600 shadow-sm">')
      tableRows.forEach((row, idx) => {
        const tag = idx === 0 ? 'th' : 'td'
        const cellClass = idx === 0 
          ? 'px-4 py-3 border border-gray-300 dark:border-gray-600 bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-700 font-bold text-left text-gray-900 dark:text-gray-100' 
          : 'px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
        result.push(`<tr class="${idx % 2 === 0 ? 'bg-white dark:bg-[rgb(var(--night-surface))]' : 'bg-gray-50 dark:bg-gray-900/50'}">`)
        row.forEach(cell => {
          const isBold = cell.includes('**')
          const cellContent = cell.replace(/\*\*/g, '')
          const finalClass = isBold ? cellClass + ' font-bold' : cellClass
          result.push(`<${tag} class="${finalClass}">${cellContent}</${tag}>`)
        })
        result.push(`</tr>`)
      })
      result.push('</table></div>')
    }
    
    html = result.join('\n')
    
    // Headers (avec meilleur style)
    html = html
      .replace(/^#### (.*$)/gim, '<h4 class="text-lg font-bold mt-6 mb-3 text-gray-800 dark:text-gray-200">$1</h4>')
      .replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold mt-8 mb-4 text-gray-800 dark:text-gray-200 border-l-4 border-primary-500 dark:border-primary-400 pl-4">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mt-10 mb-5 text-primary-600 dark:text-primary-400 border-b-2 border-primary-300 dark:border-primary-600 pb-2">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-4xl font-bold mt-12 mb-6 text-gray-900 dark:text-gray-100 border-b-4 border-primary-500 dark:border-primary-400 pb-4">$1</h1>')
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong class="font-bold">$1</strong>')
    
    // Lists (avec regroupement amélioré)
    const listRegex = /(?:^[-*+] .*(?:\n|$))+/gm
    html = html.replace(listRegex, (match) => {
      const items = match.split('\n').filter(l => l.trim().match(/^[-*+]/))
      return '<ul class="list-disc ml-6 mb-6 space-y-2 text-gray-700 dark:text-gray-300">' + 
        items.map(item => {
          const content = item.replace(/^[-*+] /, '')
          // Traiter le contenu (gras, etc.)
          const processed = content.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900 dark:text-gray-100">$1</strong>')
          return `<li class="leading-relaxed">${processed}</li>`
        }).join('') + 
        '</ul>'
    })
    
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/gim, (match, code) => {
      return `<pre class="bg-gray-100 dark:bg-gray-800 p-4 rounded overflow-x-auto my-4"><code class="text-sm">${code.trim()}</code></pre>`
    })
    
    // Inline code
    html = html.replace(/`([^`]+)`/gim, '<code class="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm">$1</code>')
    
    // Horizontal rules (séparateurs de sections)
    html = html.replace(/^---$/gim, '<hr class="my-10 border-t-2 border-gray-300 dark:border-gray-600" />')
    
    // Paragraphes (seulement pour le texte brut non formaté)
    // Diviser par doubles sauts de ligne, mais préserver les éléments HTML
    const blocks = html.split(/\n\n+/)
    html = blocks.map(block => {
      const trimmed = block.trim()
      // Ignorer si vide, ou si c'est déjà du HTML (tableaux, listes, headers, etc.)
      if (!trimmed || 
          trimmed.startsWith('<') || 
          trimmed.match(/^#+\s/) ||
          trimmed.match(/^[-*+]\s/) ||
          trimmed.match(/^\|/)) {
        return block
      }
      // Si c'est du texte brut, l'entourer d'un paragraphe
      return `<p class="mb-4 text-gray-700 dark:text-gray-300 leading-relaxed">${trimmed}</p>`
    }).join('\n\n')
    
    return html
  }

  // Calculer des statistiques supplémentaires
  const stats = useMemo(() => {
    if (!chartData || !chartData.dailyData || chartData.dailyData.length === 0) {
      return null
    }
    
    try {
      return {
        avgHoursPerDay: chartData.totalHours / chartData.dailyData.length,
        avgCommitsPerDay: chartData.totalCommits / chartData.dailyData.length,
        maxHours: Math.max(...chartData.dailyData.map(d => d.hours)),
        minHours: Math.min(...chartData.dailyData.map(d => d.hours)),
        maxCommits: Math.max(...chartData.dailyData.map(d => d.commits)),
        minCommits: Math.min(...chartData.dailyData.map(d => d.commits)),
        // Régularité : écart-type des heures
        regularity: (() => {
          const avg = chartData.totalHours / chartData.dailyData.length
          const variance = chartData.dailyData.reduce((sum, d) => sum + Math.pow(d.hours - avg, 2), 0) / chartData.dailyData.length
          return Math.sqrt(variance)
        })(),
        // Distribution par jour de la semaine
        byDayOfWeek: (() => {
          const byDay = {
            'lundi': { hours: 0, commits: 0, days: 0 },
            'mardi': { hours: 0, commits: 0, days: 0 },
            'mercredi': { hours: 0, commits: 0, days: 0 },
            'jeudi': { hours: 0, commits: 0, days: 0 },
            'vendredi': { hours: 0, commits: 0, days: 0 },
            'samedi': { hours: 0, commits: 0, days: 0 },
            'dimanche': { hours: 0, commits: 0, days: 0 }
          }
          
          chartData.dailyData.forEach(d => {
            const date = new Date(d.date)
            const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' }).toLowerCase()
            
            if (byDay[dayName]) {
              byDay[dayName].hours += d.hours
              byDay[dayName].commits += d.commits
              byDay[dayName].days += 1
            }
          })
          
          logger.debug('📊 byDayOfWeek calculé:', byDay)
          return byDay
        })()
      }
    } catch (error) {
      logger.error('Erreur calcul stats:', error)
      return null
    }
  }, [chartData])

  // Préparer les données pour les graphiques (avec vue jour/semaine/mois)
  const commitsChartData = displayData ? {
    labels: displayData.map(d => d.label || (() => {
      const date = new Date(d.date)
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
    })()),
    datasets: [{
      label: timeView === 'day' ? 'Commits par jour' : timeView === 'week' ? 'Commits par semaine' : 'Commits par mois',
      data: displayData.map(d => d.commits),
      backgroundColor: 'rgba(102, 126, 234, 0.8)',
      borderColor: 'rgb(102, 126, 234)',
      borderWidth: 2,
      borderRadius: 4
    }]
  } : null

  const hoursChartData = displayData ? {
    labels: displayData.map(d => d.label || (() => {
      const date = new Date(d.date)
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
    })()),
    datasets: [{
      label: timeView === 'day' ? 'Heures par jour' : timeView === 'week' ? 'Heures par semaine' : 'Heures par mois',
      data: displayData.map(d => d.hours),
      borderColor: 'rgb(81, 207, 102)',
      backgroundColor: 'rgba(81, 207, 102, 0.1)',
      fill: true,
      tension: 0.4,
      borderWidth: 2
    }]
  } : null

  const pieChartData = useMemo(() => {
    if (!chartData || !chartData.categories) return null
    
    try {
      // Palette de couleurs distinctives pour 8 catégories
      const colorPalette = {
        'Développement': { bg: 'rgba(59, 130, 246, 0.8)', border: 'rgb(59, 130, 246)' },     // Bleu
        'Correction': { bg: 'rgba(239, 68, 68, 0.8)', border: 'rgb(239, 68, 68)' },          // Rouge
        'Test': { bg: 'rgba(168, 85, 247, 0.8)', border: 'rgb(168, 85, 247)' },              // Violet
        'Documentation': { bg: 'rgba(34, 197, 94, 0.8)', border: 'rgb(34, 197, 94)' },       // Vert
        'Refactoring': { bg: 'rgba(245, 158, 11, 0.8)', border: 'rgb(245, 158, 11)' },       // Orange
        'Déploiement': { bg: 'rgba(99, 102, 241, 0.8)', border: 'rgb(99, 102, 241)' },       // Indigo
        'UI/UX': { bg: 'rgba(236, 72, 153, 0.8)', border: 'rgb(236, 72, 153)' },             // Rose
        'Optimisation': { bg: 'rgba(14, 165, 233, 0.8)', border: 'rgb(14, 165, 233)' }       // Cyan
      }
      
      const activeCategories = Object.keys(chartData.categories).filter(k => chartData.categories[k] > 0)
      const activeValues = activeCategories.map(k => chartData.categories[k])
      const backgroundColors = activeCategories.map(k => colorPalette[k]?.bg || 'rgba(128, 128, 128, 0.8)')
      const borderColors = activeCategories.map(k => colorPalette[k]?.border || 'rgb(128, 128, 128)')
      
      return {
        labels: activeCategories,
        datasets: [{
          data: activeValues,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 2
        }]
      }
    } catch (error) {
      logger.error('Erreur calcul pieChartData:', error)
      return null
    }
  }, [chartData])

  // Graphique par jour de la semaine
  const dayOfWeekChartData = useMemo(() => {
    // Pendant le chargement, retourner null sans warning (c'est normal)
    if (!chartData || !stats) {
      return null
    }
    
    // Si les données sont chargées mais byDayOfWeek est manquant, c'est anormal
    if (!stats.byDayOfWeek) {
      logger.warn('⚠️ byDayOfWeek manquant alors que chartData est chargé:', { 
        hasStats: !!stats, 
        hasChartData: !!chartData,
        dailyDataLength: chartData?.dailyData?.length 
      })
      return null
    }
    
    try {
      const daysOrder = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
      const labels = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
      
      const data = daysOrder.map(day => {
        const dayData = stats.byDayOfWeek[day]
        
        if (!dayData || dayData.days === 0) {
          return 0
        }
        
        const average = dayData.hours / dayData.days
        return parseFloat(average.toFixed(1))
      })
      
      logger.debug('📊 Day of week chart data:', { labels, data, byDayOfWeek: stats.byDayOfWeek })
      
      return {
        labels: labels,
        datasets: [{
          label: 'Heures moyennes',
          data: data,
          backgroundColor: 'rgba(81, 207, 102, 0.8)',
          borderColor: 'rgb(81, 207, 102)',
          borderWidth: 2,
          borderRadius: 4
        }]
      }
    } catch (error) {
      logger.error('Erreur calcul dayOfWeekChartData:', error)
      return null
    }
  }, [stats, chartData])

  // Histogramme des heures (distribution)
  const hoursDistributionData = useMemo(() => {
    if (!chartData || !chartData.dailyData || chartData.dailyData.length === 0) return null
    
    try {
      return {
        labels: ['0-2h', '2-4h', '4-6h', '6-8h', '8-10h', '10h+'],
        datasets: [{
          label: 'Nombre de jours',
          data: [
            chartData.dailyData.filter(d => d.hours >= 0 && d.hours < 2).length,
            chartData.dailyData.filter(d => d.hours >= 2 && d.hours < 4).length,
            chartData.dailyData.filter(d => d.hours >= 4 && d.hours < 6).length,
            chartData.dailyData.filter(d => d.hours >= 6 && d.hours < 8).length,
            chartData.dailyData.filter(d => d.hours >= 8 && d.hours < 10).length,
            chartData.dailyData.filter(d => d.hours >= 10).length
          ],
          backgroundColor: 'rgba(168, 85, 247, 0.8)',
          borderColor: 'rgb(168, 85, 247)',
          borderWidth: 2,
          borderRadius: 4
        }]
      }
    } catch (error) {
      logger.error('Erreur calcul hoursDistributionData:', error)
      return null
    }
  }, [chartData])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          padding: 15,
          font: { size: 12 }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: { size: 14 },
        bodyFont: { size: 13 }
      }
    }
  }

  const barOptions = {
    ...chartOptions,
    scales: {
      y: {
        beginAtZero: true,
        grace: '10%', // Ajoute 10% au-dessus de la valeur max
        ticks: {
          stepSize: 5
        }
      }
    }
  }

  const lineOptions = {
    ...chartOptions,
    scales: {
      y: {
        beginAtZero: true,
        grace: '15%', // Ajoute 15% au-dessus de la valeur max pour meilleure lisibilité
        ticks: {
          stepSize: 2
        }
      }
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 top-16 left-64 right-0 bottom-0 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Chargement...</p>
        </div>
      </div>
    )
  }

  return (
    <div id="markdown-viewer-container" className="fixed inset-0 top-16 left-64 right-0 bottom-0 overflow-y-auto bg-gradient-to-b from-gray-50 to-white dark:from-[rgb(var(--night-bg-start))] dark:to-[rgb(var(--night-bg-mid))] docs-scrollbar">
      {/* Menu de navigation sticky pour accès rapides */}
      {chartData && (
        <nav className="sticky top-0 z-50 bg-gradient-to-r from-primary-600 to-secondary-600 shadow-lg">
          <div className="max-w-7xl mx-auto px-6 py-3">
            <div className="flex flex-wrap gap-2 justify-center items-center">
              <a href="#stats" className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm font-medium transition-all backdrop-blur-sm">
                📊 Statistiques
              </a>
              <a href="#regularite" className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm font-medium transition-all backdrop-blur-sm">
                📈 Régularité
              </a>
              <a href="#repartition" className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm font-medium transition-all backdrop-blur-sm">
                🥧 Répartition
              </a>
              <a href="#tableau" className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm font-medium transition-all backdrop-blur-sm">
                📋 Tableau
              </a>
              {/* Bouton de mise à jour retiré - le script peut être exécuté manuellement via: pwsh scripts/generate_time_tracking.ps1 */}
              {/* Code conservé pour référence:
              {fileName === 'SUIVI_TEMPS_FACTURATION.md' && (
                <button
                  onClick={() => regenerateTimeTracking(true)}
                  disabled={regenerating}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-all backdrop-blur-sm flex items-center gap-2"
                  title="Mettre à jour les données avec les derniers commits Git"
                >
                  {regenerating ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      Mise à jour...
                    </>
                  ) : (
                    <>
                      🔄 Mettre à jour
                    </>
                  )}
                </button>
              )}
              */}
            </div>
          </div>
        </nav>
      )}
      <div className="max-w-7xl mx-auto p-6">
        {/* Phase 2.1 : Section Métadonnées */}
        {chartData && chartData.metadata && (
          <MetadataCard metadata={chartData.metadata} />
        )}

        {/* En-tête avec stats globales améliorées */}
        {chartData && stats && (
          <div id="stats" className="bg-gradient-to-r from-primary-500 to-secondary-500 rounded-lg shadow-lg p-6 mb-6 text-white scroll-mt-20">
            <h1 className="text-3xl font-bold mb-4">Suivi du Temps - Projet OTT</h1>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
                <div className="text-xs opacity-90 mb-1">Total Heures</div>
                <div className="text-2xl font-bold">{chartData.totalHours.toFixed(1)}h</div>
                {chartData.metadata?.filters && Object.keys(chartData.metadata.filters).length > 0 && (
                  <div className="text-xs mt-1 opacity-75">⚠️ Filtres actifs</div>
                )}
              </div>
              <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
                <div className="text-xs opacity-90 mb-1">Total Commits</div>
                <div className="text-2xl font-bold">{chartData.totalCommits}</div>
                {chartData.validation && !chartData.validation.commitsMatch && (
                  <div className="text-xs mt-1 opacity-75">⚠️ Validation</div>
                )}
              </div>
              <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
                <div className="text-xs opacity-90 mb-1">Jours Travaillés</div>
                <div className="text-2xl font-bold">{chartData.dailyData.length}</div>
              </div>
              <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
                <div className="text-xs opacity-90 mb-1">Moyenne/jour</div>
                <div className="text-2xl font-bold">{stats.avgHoursPerDay.toFixed(1)}h</div>
              </div>
              <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
                <div className="text-xs opacity-90 mb-1">Commits/jour</div>
                <div className="text-2xl font-bold">{stats.avgCommitsPerDay.toFixed(1)}</div>
              </div>
              <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
                <div className="text-xs opacity-90 mb-1">Régularité</div>
                <div className="text-2xl font-bold">
                  {stats.regularity < 2 ? '🟢' : stats.regularity < 4 ? '🟡' : '🔴'}
                </div>
                <div className="text-xs mt-1">σ={stats.regularity.toFixed(1)}h</div>
              </div>
            </div>
          </div>
        )}

        {/* Switch jour/semaine/mois */}
        {chartData && (
          <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-lg p-4 mb-6">
            <div className="flex items-center justify-center gap-4">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Vue :</span>
              <button
                onClick={() => setTimeView('day')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  timeView === 'day'
                    ? 'bg-primary-500 text-white shadow-md'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                Jour
              </button>
              <button
                onClick={() => setTimeView('week')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  timeView === 'week'
                    ? 'bg-primary-500 text-white shadow-md'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                Semaine
              </button>
              <button
                onClick={() => setTimeView('month')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  timeView === 'month'
                    ? 'bg-primary-500 text-white shadow-md'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                Mois
              </button>
            </div>
          </div>
        )}

        {/* Graphique principal unique avec basculement */}
        {chartData && (
          <div id="regularite" className="space-y-6 mb-6 scroll-mt-20">
            {/* Graphique heures principal */}
            <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">
                {timeView === 'day' ? 'Temps Passé par Jour' : timeView === 'week' ? 'Temps Passé par Semaine' : 'Temps Passé par Mois'}
              </h3>
              <div className="h-80">
                <Line data={hoursChartData} options={lineOptions} />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
                {timeView === 'day' ? 'Heures estimées par jour' : timeView === 'week' ? 'Heures estimées par semaine' : 'Heures estimées par mois'}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Camembert répartition */}
              <div id="repartition" className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-lg p-6 scroll-mt-20">
                <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Répartition par Activité</h3>
                <div className="h-64 flex items-center justify-center">
                  {pieChartData ? (
                    <Doughnut data={pieChartData} options={chartOptions} />
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400 text-center">
                      📊 Pas de données disponibles pour la répartition
                    </p>
                  )}
                </div>
              </div>

              {/* Graphique par jour de la semaine */}
              {dayOfWeekChartData && (
                <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-lg p-6">
                  <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Temps par Jour de la Semaine</h3>
                  <div className="h-64">
                    <Bar data={dayOfWeekChartData} options={barOptions} />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">Heures moyennes par jour de la semaine</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tableau récapitulatif */}
        {chartData && (
          <div id="tableau" className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-lg p-6 mb-6 scroll-mt-20">
            <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Tableau Récapitulatif</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-700">
                    <th className="px-4 py-3 border border-gray-300 dark:border-gray-600 font-bold text-left">Date</th>
                    <th className="px-4 py-3 border border-gray-300 dark:border-gray-600 font-bold text-center">Heures</th>
                    <th className="px-4 py-3 border border-gray-300 dark:border-gray-600 font-bold text-center">Commits</th>
                    <th className="px-4 py-3 border border-gray-300 dark:border-gray-600 font-bold text-center">Développement</th>
                    <th className="px-4 py-3 border border-gray-300 dark:border-gray-600 font-bold text-center">Correction</th>
                    <th className="px-4 py-3 border border-gray-300 dark:border-gray-600 font-bold text-center">Test</th>
                    <th className="px-4 py-3 border border-gray-300 dark:border-gray-600 font-bold text-center">Documentation</th>
                    <th className="px-4 py-3 border border-gray-300 dark:border-gray-600 font-bold text-center">Refactoring</th>
                    <th className="px-4 py-3 border border-gray-300 dark:border-gray-600 font-bold text-center">Déploiement</th>
                    <th className="px-4 py-3 border border-gray-300 dark:border-gray-600 font-bold text-center">UI/UX</th>
                    <th className="px-4 py-3 border border-gray-300 dark:border-gray-600 font-bold text-center">Optimisation</th>
                    {chartData.dailyData.some(d => d.details && (
                      (d.details.advances && d.details.advances.length > 0) ||
                      (d.details.fixes && d.details.fixes.length > 0) ||
                      (d.details.deployments && d.details.deployments.length > 0) ||
                      (d.details.tests && d.details.tests.length > 0)
                    )) && (
                      <th className="px-4 py-3 border border-gray-300 dark:border-gray-600 font-bold text-center">Détails</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {chartData.dailyData.map((day, idx) => {
                    const date = new Date(day.date)
                    const hasDetails = day.details && (
                      (day.details.advances && day.details.advances.length > 0) ||
                      (day.details.fixes && day.details.fixes.length > 0) ||
                      (day.details.deployments && day.details.deployments.length > 0) ||
                      (day.details.tests && day.details.tests.length > 0)
                    )
                    const tooltipText = hasDetails
                      ? `Avancées: ${day.details.advances?.length || 0}, Fixes: ${day.details.fixes?.length || 0}, Déploiements: ${day.details.deployments?.length || 0}, Tests: ${day.details.tests?.length || 0}`
                      : `${day.hours}h de travail, ${day.commits} commits`
                    
                    return (
                      <tr 
                        key={idx} 
                        className={`${idx % 2 === 0 ? 'bg-white dark:bg-[rgb(var(--night-surface))]' : 'bg-gray-50 dark:bg-gray-900/50'} hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors cursor-pointer`}
                        title={tooltipText}
                        onClick={() => hasDetails && openDayDetails(day)}
                      >
                        <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 font-medium">
                          {date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center font-bold text-primary-600 dark:text-primary-400">
                          ~{day.hours.toFixed(1)}h
                        </td>
                        <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center font-bold">
                          {day.commits}
                        </td>
                        <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{day.dev > 0 ? day.dev : '-'}</td>
                        <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{day.fix > 0 ? day.fix : '-'}</td>
                        <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{day.test > 0 ? day.test : '-'}</td>
                        <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{day.doc > 0 ? day.doc : '-'}</td>
                        <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{day.refactor > 0 ? day.refactor : '-'}</td>
                        <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{day.deploy > 0 ? day.deploy : '-'}</td>
                        <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{day.uiux > 0 ? day.uiux : '-'}</td>
                        <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{day.optim > 0 ? day.optim : '-'}</td>
                        {hasDetails && (
                          <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                openDayDetails(day)
                              }}
                              className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm transition-colors"
                              title="Voir les détails"
                            >
                              📋
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                  <tr className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-700 font-bold">
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600">Total</td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center text-primary-600 dark:text-primary-400">
                      ~{chartData.totalHours.toFixed(1)}h
                    </td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{chartData.totalCommits}</td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{chartData.categories['Développement']?.toFixed(1) || '0'}</td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{chartData.categories['Correction']?.toFixed(1) || '0'}</td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{chartData.categories['Test']?.toFixed(1) || '0'}</td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{chartData.categories['Documentation']?.toFixed(1) || '0'}</td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{chartData.categories['Refactoring']?.toFixed(1) || '0'}</td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{chartData.categories['Déploiement']?.toFixed(1) || '0'}</td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{chartData.categories['UI/UX']?.toFixed(1) || '0'}</td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{chartData.categories['Optimisation']?.toFixed(1) || '0'}</td>
                    {chartData.dailyData.some(d => d.details && (
                      (d.details.advances && d.details.advances.length > 0) ||
                      (d.details.fixes && d.details.fixes.length > 0) ||
                      (d.details.deployments && d.details.deployments.length > 0) ||
                      (d.details.tests && d.details.tests.length > 0)
                    )) && (
                      <td className="px-4 py-3 border border-gray-300 dark:border-gray-600"></td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {/* Phase 2.4 : Modal de détails par jour */}
        <DayDetailsModal 
          day={selectedDay}
          isOpen={isModalOpen}
          onClose={closeDayDetails}
        />
      </div>
    </div>
  )
}

// Composant pour visualiser la base de données
function DatabaseViewer() {
  const [databaseInfo, setDatabaseInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedTable, setSelectedTable] = useState(null)
  const { fetchWithAuth, API_URL } = useAuth()
  
  useEffect(() => {
    const loadDatabaseInfo = async () => {
      try {
        setLoading(true)
        const response = await fetchWithAuth(
          `${API_URL}/api.php/admin/database-view`,
          { method: 'GET' },
          { requiresAuth: true }
        )
        
        if (!response.ok) {
          const text = await response.text()
          throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`)
        }
        
        // Vérifier le Content-Type avant de parser
        const contentType = response.headers.get('content-type') || ''
        if (!contentType.includes('application/json')) {
          const text = await response.text()
          throw new Error(`Réponse non-JSON: ${text.substring(0, 200)}`)
        }
        
        // Lire le texte d'abord pour vérifier qu'il n'est pas vide
        const text = await response.text()
        if (!text || !text.trim()) {
          throw new Error('Réponse vide du serveur')
        }
        
        // Parser le JSON
        let data
        try {
          data = JSON.parse(text)
        } catch (parseError) {
          logger.error('Erreur parsing JSON:', parseError)
          logger.error('Texte reçu:', text.substring(0, 500))
          throw new Error(`Erreur parsing JSON: ${parseError.message}`)
        }
        
        if (data.success) {
          setDatabaseInfo(data.data)
        } else {
          throw new Error(data.error || 'Erreur lors du chargement')
        }
      } catch (err) {
        logger.error('Erreur chargement base de données:', err)
        setError(err.message || 'Impossible de charger les informations de la base de données')
      } finally {
        setLoading(false)
      }
    }
    
    loadDatabaseInfo()
  }, [fetchWithAuth, API_URL])
  
  if (loading) {
    return (
      <div className="fixed inset-0 top-16 left-64 right-0 bottom-0 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Chargement de la base de données...</p>
        </div>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="fixed inset-0 top-16 left-64 right-0 bottom-0 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-4xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">Erreur</h2>
          <p className="text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      </div>
    )
  }
  
  if (!databaseInfo) {
    return null
  }
  
  const table = selectedTable ? databaseInfo.tables.find(t => t.name === selectedTable) : null
  
  return (
    <div className="fixed inset-0 top-16 left-64 right-0 bottom-0 overflow-y-auto bg-gradient-to-b from-gray-50 to-white dark:from-[rgb(var(--night-bg-start))] dark:to-[rgb(var(--night-bg-mid))] docs-scrollbar">
      <div className="max-w-7xl mx-auto p-6">
        {/* En-tête */}
        <div className="bg-gradient-to-r from-primary-500 to-secondary-500 rounded-lg shadow-lg p-6 mb-6 text-white">
          <h1 className="text-3xl font-bold mb-2">🗄️ Base de Données</h1>
          <p className="text-white/90">Base de données: <strong>{databaseInfo.database_name}</strong></p>
          <p className="text-white/80 text-sm mt-2">
            {databaseInfo.tables.length} table{databaseInfo.tables.length > 1 ? 's' : ''} disponible{databaseInfo.tables.length > 1 ? 's' : ''}
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Liste des tables */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-lg p-4">
              <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Tables</h2>
              <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                {databaseInfo.tables.map((table) => (
                  <button
                    key={table.name}
                    onClick={() => setSelectedTable(table.name)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                      selectedTable === table.name
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{table.name}</span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        selectedTable === table.name
                          ? 'bg-white/20 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}>
                        {table.row_count}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Détails de la table sélectionnée */}
          <div className="lg:col-span-2">
            {table ? (
              <div className="space-y-6">
                {/* Informations de la table */}
                <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-lg p-6">
                  <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">
                    Table: {table.name}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    <strong>{table.row_count}</strong> ligne{table.row_count > 1 ? 's' : ''}
                  </p>
                  
                  {/* Colonnes */}
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">Colonnes</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse">
                        <thead>
                          <tr className="bg-gray-100 dark:bg-gray-800">
                            <th className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-left">Nom</th>
                            <th className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-left">Type</th>
                            <th className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-left">Nullable</th>
                            <th className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-left">Défaut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {table.columns.map((col, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white dark:bg-[rgb(var(--night-surface))]' : 'bg-gray-50 dark:bg-gray-900/50'}>
                              <td className="px-4 py-2 border border-gray-300 dark:border-gray-600 font-mono text-sm">
                                {col.column_name}
                              </td>
                              <td className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm">
                                {col.data_type}
                              </td>
                              <td className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm">
                                {col.is_nullable === 'YES' ? '✅' : '❌'}
                              </td>
                              <td className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-mono">
                                {col.column_default || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  {/* Échantillon de données */}
                  {table.sample && table.sample.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">
                        Échantillon (10 premières lignes)
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse">
                          <thead>
                            <tr className="bg-gray-100 dark:bg-gray-800">
                              {Object.keys(table.sample[0]).map((key) => (
                                <th key={key} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-left text-xs">
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {table.sample.map((row, idx) => (
                              <tr key={idx} className={idx % 2 === 0 ? 'bg-white dark:bg-[rgb(var(--night-surface))]' : 'bg-gray-50 dark:bg-gray-900/50'}>
                                {Object.values(row).map((value, colIdx) => (
                                  <td key={colIdx} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-xs">
                                    {value === null ? (
                                      <span className="text-gray-400 italic">NULL</span>
                                    ) : typeof value === 'string' && value.length > 50 ? (
                                      <span title={value}>{value.substring(0, 50)}...</span>
                                    ) : (
                                      String(value)
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-lg p-6">
                <p className="text-gray-600 dark:text-gray-400 text-center">
                  Sélectionnez une table pour voir ses détails
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

