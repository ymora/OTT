'use client'

import { useEffect, useState } from 'react'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

export default function TimeTrackingDashboard() {
  const [data, setData] = useState({ maxime: { commits: 0, hours: 0 }, yannick: { commits: 0, hours: 0 }, activities: [] })
  const [loading, setLoading] = useState(true)
  const [sections, setSections] = useState({ stats: true, table: false })
  const [chartPeriod, setChartPeriod] = useState('week') // 'week', 'month', 'year'

  // Parser les données
  const parseData = (text) => {
    const lines = text.split('\n')
    const activities = []
    let maxime = { commits: 0, hours: 0 }
    let yannick = { commits: 0, hours: 0 }
    
    for (const line of lines) {
      if (line.startsWith('|') && !line.includes('---') && !line.includes('Date')) {
        const parts = line.split('|').map(p => p.trim()).filter(p => p)
        if (parts.length >= 4) {
          const date = parts[0]
          const contributor = parts[1].replace(/\*\*/g, '')
          const commitsInfo = parts[2]
          const commits = parseInt(commitsInfo.match(/(\d+)\s+commits/)?.[1] || commitsInfo) || 0
          const hours = parseFloat(commitsInfo.match(/~?([\d.]+)h/)?.[1] || 0) || 0
          
          // Extraire les catégories
          const features = parseInt(parts[3]?.match(/(\d+)/)?.[1] || 0) || 0
          const fixes = parseInt(parts[4]?.match(/(\d+)/)?.[1] || 0) || 0
          const tests = parseInt(parts[7]?.match(/(\d+)/)?.[1] || 0) || 0
          
          // Déterminer le type principal
          let type = 'other'
          if (features > 0) type = 'feature'
          else if (fixes > 0) type = 'fix'
          else if (tests > 0) type = 'test'
          
          activities.push({ date, contributor, commits, hours, type, features, fixes, tests })
          
          if (contributor.toLowerCase() === 'maxime') {
            maxime.commits += commits
            maxime.hours += hours
          } else if (contributor.toLowerCase() === 'yannick') {
            yannick.commits += commits
            yannick.hours += hours
          }
        }
      }
    }
    
    return { maxime, yannick, activities: activities.sort((a, b) => new Date(b.date) - new Date(a.date)) }
  }

  // Charger les données
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/SUIVI_TEMPS_FACTURATION.md?t=' + Date.now())
        const text = await response.text()
        setData(parseData(text))
      } catch (error) {
        console.error('Erreur:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
    const interval = setInterval(loadData, 300000)
    return () => clearInterval(interval)
  }, [])

  const totalCommits = data.maxime.commits + data.yannick.commits
  const totalHours = data.maxime.hours + data.yannick.hours

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  const toggleSection = (section) => {
    setSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // Données pour les graphiques temporels
  const getDailyData = () => {
    const dailyData = {}
    const sortedActivities = [...data.activities].sort((a, b) => new Date(a.date) - new Date(b.date))
    
    sortedActivities.forEach(activity => {
      if (!dailyData[activity.date]) {
        dailyData[activity.date] = { maxime: { hours: 0, commits: 0 }, yannick: { hours: 0, commits: 0 } }
      }
      
      if (activity.contributor.toLowerCase() === 'maxime') {
        dailyData[activity.date].maxime.hours += activity.hours
        dailyData[activity.date].maxime.commits += activity.commits
      } else if (activity.contributor.toLowerCase() === 'yannick') {
        dailyData[activity.date].yannick.hours += activity.hours
        dailyData[activity.date].yannick.commits += activity.commits
      }
    })
    
    return dailyData
  }

  const getAggregatedData = () => {
    const dailyData = getDailyData()
    const dates = Object.keys(dailyData).sort()
    
    let aggregatedData = []
    
    switch (chartPeriod) {
      case 'week':
        // Regrouper par semaine
        const weekGroups = {}
        dates.forEach(date => {
          const weekKey = getWeekKey(date)
          const year = date.substring(0, 4)
          const weekLabel = `${year}-S${weekKey}`
          if (!weekGroups[weekLabel]) {
            weekGroups[weekLabel] = { maxime: { hours: 0, commits: 0 }, yannick: { hours: 0, commits: 0 } }
          }
          weekGroups[weekLabel].maxime.hours += dailyData[date].maxime.hours
          weekGroups[weekLabel].maxime.commits += dailyData[date].maxime.commits
          weekGroups[weekLabel].yannick.hours += dailyData[date].yannick.hours
          weekGroups[weekLabel].yannick.commits += dailyData[date].yannick.commits
        })
        aggregatedData = Object.keys(weekGroups).slice(-12).map(week => ({
          label: week,
          maxime: weekGroups[week].maxime,
          yannick: weekGroups[week].yannick
        }))
        break
        
      case 'month':
        // Regrouper par mois
        const monthGroups = {}
        dates.forEach(date => {
          const monthKey = date.substring(0, 7) // YYYY-MM
          if (!monthGroups[monthKey]) {
            monthGroups[monthKey] = { maxime: { hours: 0, commits: 0 }, yannick: { hours: 0, commits: 0 } }
          }
          monthGroups[monthKey].maxime.hours += dailyData[date].maxime.hours
          monthGroups[monthKey].maxime.commits += dailyData[date].maxime.commits
          monthGroups[monthKey].yannick.hours += dailyData[date].yannick.hours
          monthGroups[monthKey].yannick.commits += dailyData[date].yannick.commits
        })
        aggregatedData = Object.keys(monthGroups).slice(-12).map(month => ({
          label: getMonthLabel(month),
          maxime: monthGroups[month].maxime,
          yannick: monthGroups[month].yannick
        }))
        break
        
      case 'year':
        // Regrouper par année
        const yearGroups = {}
        dates.forEach(date => {
          const yearKey = date.substring(0, 4) // YYYY
          if (!yearGroups[yearKey]) {
            yearGroups[yearKey] = { maxime: { hours: 0, commits: 0 }, yannick: { hours: 0, commits: 0 } }
          }
          yearGroups[yearKey].maxime.hours += dailyData[date].maxime.hours
          yearGroups[yearKey].maxime.commits += dailyData[date].maxime.commits
          yearGroups[yearKey].yannick.hours += dailyData[date].yannick.hours
          yearGroups[yearKey].yannick.commits += dailyData[date].yannick.commits
        })
        aggregatedData = Object.keys(yearGroups).map(year => ({
          label: year,
          maxime: yearGroups[year].maxime,
          yannick: yearGroups[year].yannick
        }))
        break
        
      default:
        aggregatedData = []
    }
    
    return aggregatedData
  }

  // Fonctions utilitaires
  const getWeekKey = (date) => {
    const d = new Date(date)
    const firstDayOfYear = new Date(d.getFullYear(), 0, 1)
    const pastDaysOfYear = (d - firstDayOfYear) / 86400000
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
  }

  const getMonthLabel = (month) => {
    const date = new Date(month + '-01')
    return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
  }

  const aggregatedData = getAggregatedData()

  const hoursChartData = {
    labels: aggregatedData.map(d => d.label),
    datasets: [
      {
        label: 'Maxime',
        data: aggregatedData.map(d => d.maxime.hours),
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Yannick',
        data: aggregatedData.map(d => d.yannick.hours),
        borderColor: '#ec4899',
        backgroundColor: 'rgba(236, 72, 153, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  }

  const commitsChartData = {
    labels: aggregatedData.map(d => d.label),
    datasets: [
      {
        label: 'Maxime',
        data: aggregatedData.map(d => d.maxime.commits),
        backgroundColor: '#8b5cf6',
        borderColor: '#8b5cf6',
        borderWidth: 1
      },
      {
        label: 'Yannick',
        data: aggregatedData.map(d => d.yannick.commits),
        backgroundColor: '#ec4899',
        borderColor: '#ec4899',
        borderWidth: 1
      }
    ]
  }

  // Données pour les graphiques de répartition par activité selon la période
  const getActivityDataByPeriod = () => {
    let maximeActivities = { feature: 0, fix: 0, test: 0, other: 0 }
    let yannickActivities = { feature: 0, fix: 0, test: 0, other: 0 }
    
    // Filtrer les activités selon la période sélectionnée
    const filteredActivities = data.activities.filter(activity => {
      const activityDate = new Date(activity.date)
      const now = new Date()
      
      switch (chartPeriod) {
        case 'week':
          // Prendre les 12 dernières semaines (84 jours)
          const twelveWeeksAgo = new Date(now.getTime() - (84 * 24 * 60 * 60 * 1000))
          return activityDate >= twelveWeeksAgo
          
        case 'month':
          // Prendre les 12 derniers mois (365 jours)
          const twelveMonthsAgo = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000))
          return activityDate >= twelveMonthsAgo
          
        case 'year':
          // Prendre toutes les années
          return true
          
        default:
          return true
      }
    })
    
    // Calculer la répartition par activité
    filteredActivities.forEach(activity => {
      const person = activity.contributor.toLowerCase() === 'maxime' ? maximeActivities : yannickActivities
      person[activity.type] = (person[activity.type] || 0) + activity.commits
    })
    
    return { maximeActivities, yannickActivities }
  }

  const { maximeActivities, yannickActivities } = getActivityDataByPeriod()

  const maximeActivityChartData = {
    labels: ['Features', 'Fixes', 'Tests', 'Autres'],
    datasets: [{
      data: [maximeActivities.feature, maximeActivities.fix, maximeActivities.test, maximeActivities.other],
      backgroundColor: ['#3b82f6', '#ef4444', '#10b981', '#6b7280'],
      borderWidth: 0
    }]
  }

  const yannickActivityChartData = {
    labels: ['Features', 'Fixes', 'Tests', 'Autres'],
    datasets: [{
      data: [yannickActivities.feature, yannickActivities.fix, yannickActivities.test, yannickActivities.other],
      backgroundColor: ['#3b82f6', '#ef4444', '#10b981', '#6b7280'],
      borderWidth: 0
    }]
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          padding: 15,
          font: { size: 12 },
          usePointStyle: true
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">🕐 Suivi du Temps</h1>
          <p className="text-gray-600">Projet OTT</p>
        </div>

        {/* Stats principales */}
        <div className="mb-6">
          <button
            onClick={() => toggleSection('stats')}
            className="w-full bg-white rounded-lg shadow p-4 text-left hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">📊 Statistiques principales</h2>
              <span className="text-gray-400">{sections.stats ? '▼' : '▶'}</span>
            </div>
            {sections.stats && (
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{totalHours}h</div>
                  <div className="text-sm text-gray-500">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{totalCommits}</div>
                  <div className="text-sm text-gray-500">Commits</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {totalCommits > 0 ? (totalHours / totalCommits).toFixed(1) : 0}h
                  </div>
                  <div className="text-sm text-gray-500">Moy/commit</div>
                </div>
              </div>
            )}
          </button>
        </div>

        {/* Graphiques temporels */}
        <div className="mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">⏱️ Temps Passé par Période</h2>
            </div>
            
            {/* Sélecteur de période */}
            <div className="flex items-center justify-center space-x-2 mb-6">
              <span className="text-sm font-medium text-gray-700">Période:</span>
              {['week', 'month', 'year'].map(period => (
                <button
                  key={period}
                  onClick={() => setChartPeriod(period)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    chartPeriod === period
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {period === 'week' ? 'Semaine' : period === 'month' ? 'Mois' : 'Année'}
                </button>
              ))}
            </div>
            
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">📈 Heures par {chartPeriod === 'week' ? 'Semaine' : chartPeriod === 'month' ? 'Mois' : 'Année'}</h4>
                <div className="h-48">
                  <Line data={hoursChartData} options={chartOptions} />
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">📊 Commits par {chartPeriod === 'week' ? 'Semaine' : chartPeriod === 'month' ? 'Mois' : 'Année'}</h4>
                <div className="h-48">
                  <Bar data={commitsChartData} options={chartOptions} />
                </div>
              </div>
            </div>
            
            {/* Répartition par activité par personne */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-4">🎯 Répartition par Activité ({chartPeriod === 'week' ? '12 dernières semaines' : chartPeriod === 'month' ? '12 derniers mois' : 'toutes les années'})</h4>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h5 className="text-sm font-medium text-purple-600 mb-3 text-center">Maxime</h5>
                  <div className="h-40">
                    <Doughnut data={maximeActivityChartData} options={chartOptions} />
                  </div>
                  <div className="text-xs text-gray-500 mt-2 text-center">
                    {maximeActivities.feature + maximeActivities.fix + maximeActivities.test + maximeActivities.other} commits
                  </div>
                </div>
                <div>
                  <h5 className="text-sm font-medium text-pink-600 mb-3 text-center">Yannick</h5>
                  <div className="h-40">
                    <Doughnut data={yannickActivityChartData} options={chartOptions} />
                  </div>
                  <div className="text-xs text-gray-500 mt-2 text-center">
                    {yannickActivities.feature + yannickActivities.fix + yannickActivities.test + yannickActivities.other} commits
                  </div>
                </div>
              </div>
              {/* Debug info */}
              <div className="mt-4 text-xs text-gray-400 text-center">
                Période: {chartPeriod} | Total Maxime: {maximeActivities.feature + maximeActivities.fix + maximeActivities.test + maximeActivities.other} | Total Yannick: {yannickActivities.feature + yannickActivities.fix + yannickActivities.test + yannickActivities.other}
              </div>
            </div>

        {/* Tableau unique regroupé */}
        <div className="mb-6">
          <button
            onClick={() => toggleSection('table')}
            className="w-full bg-white rounded-lg shadow p-4 text-left hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">📋 Tableau complet</h2>
              <span className="text-gray-400">{sections.table ? '▼' : '▶'}</span>
            </div>
            {sections.table && (
              <div className="mt-4">
                {/* Stats développeurs */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-xl font-bold text-purple-600">Maxime</div>
                    <div className="text-sm text-gray-600 mt-2">{data.maxime.commits} commits</div>
                    <div className="text-sm text-gray-600">{data.maxime.hours}h</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {totalCommits > 0 ? ((data.maxime.commits / totalCommits) * 100).toFixed(1) : 0}%
                    </div>
                  </div>
                  <div className="text-center p-4 bg-pink-50 rounded-lg">
                    <div className="text-xl font-bold text-pink-600">Yannick</div>
                    <div className="text-sm text-gray-600 mt-2">{data.yannick.commits} commits</div>
                    <div className="text-sm text-gray-600">{data.yannick.hours}h</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {totalCommits > 0 ? ((data.yannick.commits / totalCommits) * 100).toFixed(1) : 0}%
                    </div>
                  </div>
                </div>

                {/* Tableau détaillé complet */}
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">📊 Historique complet</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left py-2 px-2">Date</th>
                          <th className="text-left py-2 px-2">Développeur</th>
                          <th className="text-center py-2 px-2">Commits</th>
                          <th className="text-center py-2 px-2">Heures</th>
                          <th className="text-center py-2 px-2">Type</th>
                          <th className="text-center py-2 px-2">Détail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.activities.map((activity, i) => (
                          <tr key={i} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-2 text-xs">{activity.date}</td>
                            <td className="py-2 px-2">
                              <span className={`text-xs font-medium ${
                                activity.contributor === 'Maxime' ? 'text-purple-600' : 'text-pink-600'
                              }`}>
                                {activity.contributor}
                              </span>
                            </td>
                            <td className="text-center py-2 px-2 text-xs font-semibold">{activity.commits}</td>
                            <td className="text-center py-2 px-2 text-xs">{activity.hours}h</td>
                            <td className="text-center py-2 px-2">
                              <span className={`px-1 py-0.5 rounded text-xs ${
                                activity.type === 'feature' ? 'bg-blue-100 text-blue-800' :
                                activity.type === 'fix' ? 'bg-red-100 text-red-800' :
                                activity.type === 'test' ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {activity.type}
                              </span>
                            </td>
                            <td className="text-center py-2 px-2 text-xs text-gray-500">
                              {activity.commits > 0 ? (activity.hours / activity.commits).toFixed(1) : 0}h/commit
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-xs text-gray-500 mt-2 text-center">
                    {data.activities.length} jours d'activité • {totalCommits} commits • {totalHours}h total
                  </div>
                </div>
              </div>
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
