'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { withBasePath } from '@/lib/utils'
import logger from '@/lib/logger'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
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
  'suivi-temps': 'SUIVI_TEMPS_FACTURATION.md'
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
    return <MarkdownViewer fileName="SUIVI_TEMPS_FACTURATION.md" />
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
          // Envoyer le thème immédiatement
          sendThemeToIframe()
          // Réessayer après un court délai pour s'assurer que le script est prêt
          setTimeout(() => {
            sendThemeToIframe()
          }, 100)
          // Encore une fois après un délai plus long
          setTimeout(() => {
            sendThemeToIframe()
          }, 500)
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
  
  // Ref pour éviter les rechargements multiples du même fichier
  const loadedFileNameRef = useRef(null)
  const isLoadingRef = useRef(false)
  
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

  useEffect(() => {
    // Ne charger que si le fichier a changé ou n'a jamais été chargé
    if (loadedFileNameRef.current === fileName || isLoadingRef.current) {
      return
    }
    
    isLoadingRef.current = true
    loadedFileNameRef.current = fileName
    
    const loadMarkdown = async () => {
      try {
        // En développement local, essayer de charger directement depuis /public
        // Sinon, charger depuis l'API
        const isLocal = typeof window !== 'undefined' && window.location.hostname === 'localhost'
        
        let text = ''
        if (isLocal) {
          // Essayer de charger depuis le serveur Next.js (si le fichier est dans public/)
          try {
            const localResponse = await fetch(`/${fileName}`)
            if (localResponse.ok) {
              text = await localResponse.text()
            } else {
              throw new Error('Not in public')
            }
          } catch (e) {
            // Si pas dans public, essayer l'API locale
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
            const response = await fetch(`${apiUrl}/api.php/docs/${fileName}`)
            if (response.ok) {
              text = await response.text()
            } else {
              throw new Error('API not available')
            }
          }
        } else {
          // En production, charger depuis l'API
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ott-jbln.onrender.com'
          const response = await fetch(`${apiUrl}/api.php/docs/${fileName}`)
          if (response.ok) {
            text = await response.text()
          } else {
            throw new Error('API not available')
          }
        }
        
        setContent(text)
        // Parser les données pour les graphiques
        const parsed = parseMarkdownForCharts(text)
        setChartData(parsed)
      } catch (error) {
        logger.error('Erreur chargement markdown:', error)
        setContent('# Erreur\n\nImpossible de charger le document.\n\n' + error.message)
      } finally {
        setLoading(false)
        isLoadingRef.current = false
      }
    }
    loadMarkdown()
  }, [fileName])

  // Fonction pour parser le markdown et extraire les données pour les graphiques
  function parseMarkdownForCharts(md) {
    const data = {
      dailyData: [],
      categories: {
        'Développement': 0,
        'Correction': 0,
        'Test': 0,
        'Documentation': 0,
        'Refactoring': 0,
        'Déploiement': 0
      },
      totalHours: 0,
      totalCommits: 0
    }

    // Parser le tableau récapitulatif (format flexible)
    const tableRegex = /\| (\d{4}-\d{2}-\d{2}) \| ~?([\d.]+)h? \| (\d+) \| ([\d.-]+) \| ([\d.-]+) \| ([\d.-]+) \| ([\d.-]+) \| ([\d.-]+) \| ([\d.-]+) \|/g
    let match
    while ((match = tableRegex.exec(md)) !== null) {
      const date = match[1]
      const hours = parseFloat(match[2]) || 0
      const commits = parseInt(match[3]) || 0
      const dev = parseFloat(match[4]) || 0
      const fix = parseFloat(match[5]) || 0
      const test = parseFloat(match[6]) || 0
      const doc = parseFloat(match[7]) || 0
      const refactor = parseFloat(match[8]) || 0
      const deploy = parseFloat(match[9]) || 0

      // Ignorer la ligne de séparation (---)
      if (date.includes('---') || isNaN(hours)) continue

      data.dailyData.push({
        date,
        hours,
        commits,
        dev,
        fix,
        test,
        doc,
        refactor,
        deploy
      })

      data.totalHours += hours
      data.totalCommits += commits
    }

    // Parser les totaux (format flexible avec ou sans **)
    const totalMatch = md.match(/(?:\*\*)?Total(?:\*\*)? \| (?:\*\*)?~?([\d.]+)h?(?:\*\*)? \| (?:\*\*)?(\d+)(?:\*\*)? \| (?:\*\*)?([\d.]+)(?:\*\*)? \| (?:\*\*)?([\d.]+)(?:\*\*)? \| (?:\*\*)?([\d.]+)(?:\*\*)? \| (?:\*\*)?([\d.]+)(?:\*\*)? \| (?:\*\*)?([\d.]+)(?:\*\*)? \| (?:\*\*)?([\d.]+)(?:\*\*)?/)
    if (totalMatch) {
      data.categories['Développement'] = parseFloat(totalMatch[3]) || 0
      data.categories['Correction'] = parseFloat(totalMatch[4]) || 0
      data.categories['Test'] = parseFloat(totalMatch[5]) || 0
      data.categories['Documentation'] = parseFloat(totalMatch[6]) || 0
      data.categories['Refactoring'] = parseFloat(totalMatch[7]) || 0
      data.categories['Déploiement'] = parseFloat(totalMatch[8]) || 0
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
          const byDay = {}
          chartData.dailyData.forEach(d => {
            const date = new Date(d.date)
            const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' })
            if (!byDay[dayName]) {
              byDay[dayName] = { hours: 0, commits: 0, days: 0 }
            }
            byDay[dayName].hours += d.hours
            byDay[dayName].commits += d.commits
            byDay[dayName].days += 1
          })
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
      return {
        labels: Object.keys(chartData.categories).filter(k => chartData.categories[k] > 0),
        datasets: [{
          data: Object.values(chartData.categories).filter(v => v > 0),
      backgroundColor: [
        'rgba(102, 126, 234, 0.8)',   // Développement
        'rgba(239, 68, 68, 0.8)',      // Correction
        'rgba(245, 158, 11, 0.8)',     // Test
        'rgba(34, 197, 94, 0.8)',     // Documentation
        'rgba(168, 85, 247, 0.8)',    // Refactoring
        'rgba(59, 130, 246, 0.8)'     // Déploiement
      ],
      borderColor: [
        'rgb(102, 126, 234)',
        'rgb(239, 68, 68)',
        'rgb(245, 158, 11)',
        'rgb(34, 197, 94)',
        'rgb(168, 85, 247)',
        'rgb(59, 130, 246)'
      ],
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
    if (!stats || !stats.byDayOfWeek) return null
    
    try {
      return {
    labels: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'],
    datasets: [{
      label: 'Heures moyennes',
      data: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'].map(day => {
        const dayData = stats.byDayOfWeek[day.charAt(0).toUpperCase() + day.slice(1)]
        return dayData ? (dayData.hours / dayData.days).toFixed(1) : 0
      }),
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
  }, [stats])

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
            <div className="flex flex-wrap gap-2 justify-center">
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
            </div>
          </div>
        </nav>
      )}
      <div className="max-w-7xl mx-auto p-6">
        {/* En-tête avec stats globales */}
        {chartData && stats && (
          <div id="stats" className="bg-gradient-to-r from-primary-500 to-secondary-500 rounded-lg shadow-lg p-6 mb-6 text-white scroll-mt-20">
            <h1 className="text-3xl font-bold mb-4">Suivi du Temps - Projet OTT</h1>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
                <div className="text-xs opacity-90 mb-1">Total Heures</div>
                <div className="text-2xl font-bold">{chartData.totalHours.toFixed(1)}h</div>
              </div>
              <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
                <div className="text-xs opacity-90 mb-1">Total Commits</div>
                <div className="text-2xl font-bold">{chartData.totalCommits}</div>
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

        {/* Graphiques */}
        {chartData && (
          <div id="regularite" className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 scroll-mt-20">
            {/* Graphique commits par jour */}
            <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Régularité du Travail</h3>
              <div className="h-64">
                <Bar data={commitsChartData} options={barOptions} />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
                {timeView === 'day' ? 'Nombre de commits par jour' : timeView === 'week' ? 'Nombre de commits par semaine' : 'Nombre de commits par mois'}
              </p>
            </div>

            {/* Graphique heures */}
            <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">
                {timeView === 'day' ? 'Temps Passé par Jour' : timeView === 'week' ? 'Temps Passé par Semaine' : 'Temps Passé par Mois'}
              </h3>
              <div className="h-64">
                <Line data={hoursChartData} options={lineOptions} />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
                {timeView === 'day' ? 'Heures estimées par jour' : timeView === 'week' ? 'Heures estimées par semaine' : 'Heures estimées par mois'}
              </p>
            </div>

            {/* Camembert répartition */}
            <div id="repartition" className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-lg p-6 scroll-mt-20">
              <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Répartition par Activité</h3>
              <div className="h-64 flex items-center justify-center">
                <Doughnut data={pieChartData} options={chartOptions} />
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

            {/* Histogramme distribution des heures */}
            {hoursDistributionData && (
              <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-lg p-6 lg:col-span-2">
                <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Distribution du Temps de Travail</h3>
                <div className="h-64">
                  <Bar data={hoursDistributionData} options={barOptions} />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">Nombre de jours par tranche d'heures</p>
              </div>
            )}
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
                  </tr>
                </thead>
                <tbody>
                  {chartData.dailyData.map((day, idx) => {
                    const date = new Date(day.date)
                    return (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white dark:bg-[rgb(var(--night-surface))]' : 'bg-gray-50 dark:bg-gray-900/50'}>
                        <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 font-medium">
                          {date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center font-bold text-primary-600 dark:text-primary-400">
                          ~{day.hours}h
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
                      </tr>
                    )
                  })}
                  <tr className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-700 font-bold">
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600">Total</td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center text-primary-600 dark:text-primary-400">
                      ~{chartData.totalHours.toFixed(1)}h
                    </td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{chartData.totalCommits}</td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{chartData.categories['Développement'].toFixed(1)}</td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{chartData.categories['Correction'].toFixed(1)}</td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{chartData.categories['Test'].toFixed(1)}</td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{chartData.categories['Documentation'].toFixed(1)}</td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{chartData.categories['Refactoring'].toFixed(1)}</td>
                    <td className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-center">{chartData.categories['Déploiement'].toFixed(1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

