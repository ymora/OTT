'use client'

import DiagnosticsPanel from '@/components/DiagnosticsPanel';

export default function DiagnosticsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="animate-slide-up">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">🔍 Diagnostics</h1>
        <p className="text-gray-600">Statut API, base de données et variables frontend</p>
      </div>
      <DiagnosticsPanel />
    </div>
  );
}

