'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Terminal série pour afficher les logs en temps réel
 * onRead doit être une fonction qui retourne une fonction de nettoyage
 */
export default function SerialTerminal({ 
  isConnected, 
  onRead, 
  onWrite,
  autoScroll = true 
}) {
  const [logs, setLogs] = useState([])
  const [command, setCommand] = useState('')
  const [filter, setFilter] = useState('')
  const [filterLevel, setFilterLevel] = useState('all') // all, INFO, WARN, ERROR
  const terminalRef = useRef(null)
  const inputRef = useRef(null)

  // Parser une ligne de log
  const parseLogLine = useCallback((line) => {
    if (!line || !line.trim()) return null

    const timestamp = new Date()
    let level = 'INFO'
    let tag = 'UNKNOWN'
    let message = line.trim()

    // Détecter le niveau
    if (line.includes('[ERROR]') || line.includes('ERROR') || line.includes('ERREUR')) {
      level = 'ERROR'
    } else if (line.includes('[WARN]') || line.includes('WARN') || line.includes('ATTENTION')) {
      level = 'WARN'
    } else if (line.includes('[DEBUG]') || line.includes('DEBUG')) {
      level = 'DEBUG'
    }

    // Détecter le tag
    const tagMatch = line.match(/\[(\w+)\]/)
    if (tagMatch) {
      tag = tagMatch[1]
    }

    return {
      id: `${timestamp.getTime()}-${Math.random()}`,
      timestamp,
      level,
      tag,
      message,
      raw: line
    }
  }, [])

  // Ajouter un log
  const addLog = useCallback((text) => {
    if (!text) return

    // Traiter chaque ligne
    const lines = text.split('\n').filter(l => l.trim())
    const newLogs = lines.map(line => parseLogLine(line)).filter(Boolean)

    if (newLogs.length > 0) {
      setLogs(prev => {
        const updated = [...prev, ...newLogs]
        // Limiter à 10000 lignes pour la performance
        return updated.slice(-10000)
      })
    }
  }, [parseLogLine])

  // Écouter les données du port série
  useEffect(() => {
    if (isConnected && onRead) {
      const stopReading = onRead(addLog)
      return () => {
        if (stopReading) stopReading()
      }
    }
  }, [isConnected, onRead, addLog])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  // Filtrer les logs
  const filteredLogs = logs.filter(log => {
    if (filterLevel !== 'all' && log.level !== filterLevel) return false
    if (filter && !log.raw.toLowerCase().includes(filter.toLowerCase())) return false
    return true
  })

  // Envoyer une commande
  const handleSendCommand = useCallback((e) => {
    e.preventDefault()
    if (!command.trim() || !isConnected || !onWrite) return

    const commandToSend = command.trim() + '\n'
    onWrite(commandToSend)
    
    // Ajouter la commande aux logs
    addLog(`> ${command.trim()}`)
    setCommand('')
  }, [command, isConnected, onWrite, addLog])

  // Couleurs selon le niveau
  const getLogColor = (level) => {
    switch (level) {
      case 'ERROR': return 'text-red-600 dark:text-red-400'
      case 'WARN': return 'text-yellow-600 dark:text-yellow-400'
      case 'DEBUG': return 'text-gray-500 dark:text-gray-400'
      default: return 'text-gray-800 dark:text-gray-200'
    }
  }

  // Exporter les logs
  const exportLogs = useCallback(() => {
    const content = filteredLogs.map(log => 
      `[${log.timestamp.toISOString()}] [${log.level}] [${log.tag}] ${log.message}`
    ).join('\n')
    
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ott-logs-${new Date().toISOString().split('T')[0]}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredLogs])

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">📺 Terminal série</h3>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded ${isConnected ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
            {isConnected ? '● Connecté' : '○ Déconnecté'}
          </span>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          placeholder="Rechercher dans les logs..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="input flex-1 text-sm"
        />
        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value)}
          className="input text-sm"
        >
          <option value="all">Tous les niveaux</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
        </select>
        <button
          onClick={() => setLogs([])}
          className="btn-secondary text-sm"
          title="Effacer les logs"
        >
          🗑️ Effacer
        </button>
        <button
          onClick={exportLogs}
          className="btn-secondary text-sm"
          disabled={filteredLogs.length === 0}
          title="Exporter les logs"
        >
          📋 Exporter
        </button>
      </div>

      {/* Zone de logs */}
      <div
        ref={terminalRef}
        className="bg-black text-green-400 font-mono text-xs p-4 rounded-lg h-96 overflow-y-auto"
        style={{ fontFamily: 'monospace' }}
      >
        {filteredLogs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            {isConnected ? 'En attente de données...' : 'Connectez un port série pour voir les logs'}
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="mb-1">
              <span className="text-gray-500">[{log.timestamp.toLocaleTimeString()}]</span>
              <span className={`ml-2 ${getLogColor(log.level)}`}>
                [{log.tag}] {log.message}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Champ de commande */}
      {isConnected && (
        <form onSubmit={handleSendCommand} className="mt-3 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Entrer une commande (ex: AT, AT+CCID)..."
            className="input flex-1 text-sm font-mono"
            disabled={!isConnected}
          />
          <button
            type="submit"
            disabled={!isConnected || !command.trim()}
            className="btn-primary text-sm"
          >
            Envoyer
          </button>
        </form>
      )}

      <div className="mt-2 text-xs text-gray-500">
        {filteredLogs.length} ligne(s) affichée(s) sur {logs.length} total
      </div>
    </div>
  )
}

