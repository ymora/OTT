/**
 * Composant USB Streaming simplifié et factorisé
 * Remplace le UsbStreamingTab.js complexe par une version simple qui fonctionne
 */

'use client'

import { useState, useCallback } from 'react'
import { useSimpleUsbStreaming } from '@/hooks/useSimpleUsbStreaming'
import logger from '@/lib/logger'

export default function SimpleUsbStreamingTab() {
  const {
    isConnected,
    logs,
    isSimpleMode,
    connect,
    disconnect,
    clearLogs,
    toggleMode
  } = useSimpleUsbStreaming()

  return (
    <div className="space-y-6 p-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        {/* En-tête */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            🔌 USB Streaming Simplifié
          </h2>
          
          <button
            onClick={toggleMode}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              isSimpleMode 
                ? 'bg-green-600 text-white hover:bg-green-700 shadow-green-200' 
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
            }`}
          >
            {isSimpleMode ? '✅ Mode Simple' : '🔧 Mode Normal'}
          </button>
        </div>

        {/* Instructions */}
        <div className={`mb-6 p-4 rounded-lg border ${
          isSimpleMode 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <h3 className="font-semibold mb-2">
            {isSimpleMode ? '💡 Mode Simple Activé' : '⚙️ Mode Normal'}
          </h3>
          <p className="text-sm">
            {isSimpleMode 
              ? 'Connexion directe comme la page de test qui fonctionne. Idéal pour contourner les problèmes Web Serial API avec COM3.'
              : 'Utilise la logique complexe existante du dashboard.'
            }
          </p>
        </div>

        {/* Boutons de contrôle */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={connect}
            disabled={isConnected}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              isConnected 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-green-600 text-white hover:bg-green-700 shadow-green-200 hover:shadow-green-300'
            }`}
          >
            {isConnected ? '✅ Connecté' : '🔌 Se Connecter'}
          </button>
          
          <button
            onClick={disconnect}
            disabled={!isConnected}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              !isConnected 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-red-600 text-white hover:bg-red-700 shadow-red-200 hover:shadow-red-300'
            }`}
          >
            🔌 Se Déconnecter
          </button>
          
          <button
            onClick={clearLogs}
            className="px-6 py-3 rounded-lg font-medium bg-gray-600 text-white hover:bg-gray-700 shadow-gray-200 hover:shadow-gray-300 transition-all"
          >
            🗑️ Vider les Logs
          </button>
        </div>

        {/* Console de logs */}
        <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
          <div className="bg-gray-100 dark:bg-gray-900 px-4 py-2 border-b border-gray-300 dark:border-gray-600">
            <h3 className="font-mono text-sm font-semibold text-gray-700 dark:text-gray-300">
              📋 Console USB ({logs.length} logs)
            </h3>
          </div>
          
          <div className="h-96 overflow-y-auto bg-black text-green-400 font-mono text-sm p-4">
            {logs.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                Aucun log... Connectez-vous pour voir les données de l'ESP32
              </div>
            ) : (
              logs.map((log, index) => (
                <div 
                  key={log.timestamp || index} 
                  className={`mb-1 ${
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'success' ? 'text-green-400' :
                    log.type === 'warning' ? 'text-yellow-400' :
                    'text-green-400'
                  }`}
                >
                  {log.message}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Statut de connexion */}
        <div className={`mt-4 p-3 rounded-lg text-center font-medium ${
          isConnected 
            ? 'bg-green-100 text-green-800 border border-green-300' 
            : 'bg-red-100 text-red-800 border border-red-300'
        }`}>
          {isConnected ? '🟢 CONNECTÉ - Données en temps réel' : '🔴 NON CONNECTÉ'}
        </div>
      </div>
    </div>
  )
}
