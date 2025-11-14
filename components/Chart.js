'use client'

import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
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
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

export default function Chart({ data = [], type }) {
  // Protection si pas de données
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        <p>📊 Pas de données disponibles</p>
      </div>
    )
  }

  const limitedData = [...data]
    .sort((a, b) => new Date(a.timestamp || a.created_at || 0) - new Date(b.timestamp || b.created_at || 0))
    .slice(-20)

  const chartData = {
    labels: limitedData.map(d => d.timestamp || d.created_at
      ? new Date(d.timestamp || d.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})
      : (d.device_name || '')
    ),
    datasets: [{
      label: type === 'flowrate' ? 'Débit (L/min)' : 'Batterie (%)',
      data: limitedData.map(d => type === 'flowrate'
        ? Number(d.flowrate ?? d.value ?? 0)
        : Number(d.battery ?? d.last_battery ?? 0)
      ),
      borderColor: type === 'flowrate' ? 'rgb(102, 126, 234)' : 'rgb(81, 207, 102)',
      backgroundColor: type === 'flowrate' ? 'rgba(102, 126, 234, 0.1)' : 'rgba(81, 207, 102, 0.1)',
      fill: true,
      tension: 0.4,
    }]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: { size: 14 },
        bodyFont: { size: 13 },
      }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0, 0, 0, 0.05)' } },
      x: { grid: { display: false } }
    },
    animation: {
      duration: 1000,
      easing: 'easeInOutQuart'
    }
  }

  return (
    <div className="h-64">
      <Line data={chartData} options={options} />
    </div>
  )
}

