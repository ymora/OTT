/**
 * Script de monitoring automatique des redémarrages en boucle
 * À injecter dans la console F12 ou dans la page
 */

(function() {
  'use strict';
  
  console.log('🔍 Monitoring des redémarrages activé...');
  
  // Stocker les informations de redémarrage
  const rebootData = {
    count: parseInt(sessionStorage.getItem('_rebootCount') || '0'),
    timestamps: JSON.parse(sessionStorage.getItem('_rebootTimestamps') || '[]'),
    logs: JSON.parse(sessionStorage.getItem('_rebootLogs') || '[]')
  };
  
  // Incrémenter le compteur
  rebootData.count++;
  rebootData.timestamps.push(Date.now());
  
  // Garder seulement les 20 dernières entrées
  if (rebootData.timestamps.length > 20) {
    rebootData.timestamps.shift();
  }
  
  // Sauvegarder
  sessionStorage.setItem('_rebootCount', rebootData.count.toString());
  sessionStorage.setItem('_rebootTimestamps', JSON.stringify(rebootData.timestamps));
  
  // Détecter une boucle (plus de 3 redémarrages en moins de 10 secondes)
  if (rebootData.timestamps.length >= 3) {
    const recent = rebootData.timestamps.slice(-3);
    const timeSpan = recent[recent.length - 1] - recent[0];
    
    if (timeSpan < 10000) {
      console.error('🔴 BOUCLE DE REDÉMARRAGE DÉTECTÉE!');
      console.error(`   ${recent.length} redémarrages en ${timeSpan}ms`);
      console.error('   Timestamps:', recent);
      
      // Afficher une alerte visuelle
      const alert = document.createElement('div');
      alert.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #dc2626;
        color: white;
        padding: 20px;
        z-index: 99999;
        text-align: center;
        font-weight: bold;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      `;
      alert.innerHTML = `
        🔴 BOUCLE DE REDÉMARRAGE DÉTECTÉE! 
        ${recent.length} redémarrages en ${(timeSpan/1000).toFixed(1)}s
        <br>
        <button onclick="sessionStorage.clear(); location.reload();" 
                style="margin-top: 10px; padding: 8px 16px; background: white; color: #dc2626; border: none; border-radius: 4px; cursor: pointer;">
          Vider le cache et redémarrer
        </button>
      `;
      document.body.appendChild(alert);
    }
  }
  
  // Intercepter les logs de la console
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  const logEntries = [];
  const maxLogs = 100;
  
  function addLog(level, args) {
    const entry = {
      timestamp: Date.now(),
      level: level,
      message: Array.from(args).map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ')
    };
    
    logEntries.push(entry);
    if (logEntries.length > maxLogs) {
      logEntries.shift();
    }
    
    // Sauvegarder les logs importants
    if (level === 'error' || entry.message.includes('redirect') || entry.message.includes('reload')) {
      rebootData.logs.push(entry);
      if (rebootData.logs.length > 50) {
        rebootData.logs.shift();
      }
      sessionStorage.setItem('_rebootLogs', JSON.stringify(rebootData.logs));
    }
  }
  
  console.log = function(...args) {
    addLog('log', args);
    originalLog.apply(console, args);
  };
  
  console.error = function(...args) {
    addLog('error', args);
    originalError.apply(console, args);
  };
  
  console.warn = function(...args) {
    addLog('warn', args);
    originalWarn.apply(console, args);
  };
  
  // Surveiller les redirections
  let redirectCount = 0;
  const originalReplace = window.location.replace;
  const originalAssign = window.location.assign;
  const originalReload = window.location.reload;
  
  window.location.replace = function(...args) {
    redirectCount++;
    console.warn(`[MONITOR] Redirection #${redirectCount}:`, args[0]);
    if (redirectCount > 5) {
      console.error('[MONITOR] 🔴 Trop de redirections détectées!');
    }
    return originalReplace.apply(window.location, args);
  };
  
  window.location.assign = function(...args) {
    redirectCount++;
    console.warn(`[MONITOR] Navigation #${redirectCount}:`, args[0]);
    return originalAssign.apply(window.location, args);
  };
  
  window.location.reload = function(...args) {
    console.warn('[MONITOR] Rechargement de la page');
    return originalReload.apply(window.location, args);
  };
  
  // Surveiller les erreurs non capturées
  window.addEventListener('error', (event) => {
    console.error('[MONITOR] Erreur non capturée:', event.error);
    addLog('error', [event.error?.message || event.message]);
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[MONITOR] Promise rejetée:', event.reason);
    addLog('error', [event.reason?.message || String(event.reason)]);
  });
  
  // Afficher le résumé toutes les 5 secondes
  setInterval(() => {
    if (rebootData.count > 1) {
      console.log(`[MONITOR] Compteur de redémarrages: ${rebootData.count}`);
      console.log(`[MONITOR] Redirections détectées: ${redirectCount}`);
      
      if (rebootData.logs.length > 0) {
        console.log('[MONITOR] Derniers logs importants:');
        rebootData.logs.slice(-5).forEach(log => {
          console.log(`  [${new Date(log.timestamp).toLocaleTimeString()}] ${log.level}: ${log.message.substring(0, 100)}`);
        });
      }
    }
  }, 5000);
  
  // Fonction pour obtenir le rapport complet
  window.getRebootReport = function() {
    return {
      rebootCount: rebootData.count,
      redirectCount: redirectCount,
      timestamps: rebootData.timestamps,
      recentLogs: rebootData.logs.slice(-20),
      allLogs: logEntries.slice(-50)
    };
  };
  
  console.log(`[MONITOR] ✅ Monitoring activé (redémarrage #${rebootData.count})`);
  console.log('[MONITOR] Tapez getRebootReport() dans la console pour voir le rapport complet');
  
  // Créer un panneau de monitoring visible sur la page
  function createMonitorPanel() {
    const panel = document.createElement('div');
    panel.id = 'monitor-panel';
    panel.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 400px;
      max-height: 500px;
      background: rgba(0, 0, 0, 0.9);
      color: #00ff00;
      padding: 15px;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      z-index: 99998;
      overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border: 2px solid #00ff00;
    `;
    
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #00ff00; padding-bottom: 5px;';
    header.innerHTML = `
      <strong style="color: #00ff00;">🔍 MONITOR ACTIF</strong>
      <button id="monitor-toggle" style="background: #00ff00; color: #000; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px;">Masquer</button>
    `;
    
    const content = document.createElement('div');
    content.id = 'monitor-content';
    content.style.cssText = 'line-height: 1.6;';
    
    panel.appendChild(header);
    panel.appendChild(content);
    document.body.appendChild(panel);
    
    // Toggle visibility
    document.getElementById('monitor-toggle').addEventListener('click', () => {
      const isHidden = content.style.display === 'none';
      content.style.display = isHidden ? 'block' : 'none';
      document.getElementById('monitor-toggle').textContent = isHidden ? 'Masquer' : 'Afficher';
    });
    
    // Mettre à jour le panneau toutes les secondes
    function updatePanel() {
      const recent = rebootData.timestamps.slice(-5);
      const timeSpans = recent.length > 1 ? recent.slice(1).map((t, i) => t - recent[i]) : [];
      const avgTime = timeSpans.length > 0 ? timeSpans.reduce((a, b) => a + b, 0) / timeSpans.length : 0;
      
      const isLooping = recent.length >= 3 && (recent[recent.length - 1] - recent[0]) < 10000;
      
      content.innerHTML = `
        <div style="margin-bottom: 10px;">
          <strong style="color: ${isLooping ? '#ff0000' : '#00ff00'};">Redémarrages:</strong> ${rebootData.count}
          ${isLooping ? ' <span style="color: #ff0000;">🔴 BOUCLE!</span>' : ''}
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Redirections:</strong> ${redirectCount}
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Temps moyen entre redémarrages:</strong> ${avgTime > 0 ? (avgTime / 1000).toFixed(1) + 's' : 'N/A'}
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Derniers redémarrages:</strong>
          <div style="margin-left: 10px; font-size: 10px; color: #888;">
            ${recent.map((t, i) => {
              const date = new Date(t);
              return `${i + 1}. ${date.toLocaleTimeString()}`;
            }).join('<br>')}
          </div>
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Derniers logs importants:</strong>
          <div style="margin-left: 10px; font-size: 10px; max-height: 150px; overflow-y: auto;">
            ${rebootData.logs.slice(-5).map(log => {
              const date = new Date(log.timestamp);
              const color = log.level === 'error' ? '#ff4444' : log.level === 'warn' ? '#ffaa00' : '#888';
              return `<div style="color: ${color}; margin-bottom: 3px;">
                [${date.toLocaleTimeString()}] ${log.message.substring(0, 80)}${log.message.length > 80 ? '...' : ''}
              </div>`;
            }).join('') || '<div style="color: #888;">Aucun log</div>'}
          </div>
        </div>
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #333;">
          <button onclick="sessionStorage.clear(); location.reload();" 
                  style="background: #ff0000; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; width: 100%;">
            🔄 Vider cache et redémarrer
          </button>
        </div>
      `;
    }
    
    // Mettre à jour toutes les secondes
    setInterval(updatePanel, 1000);
    updatePanel();
  }
  
  // Attendre que le DOM soit prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createMonitorPanel);
  } else {
    createMonitorPanel();
  }
})();

