'use client';

import { useEffect, useMemo, useState } from 'react';

const sanitizeUrl = (url) => {
  if (!url) return '';
  return url.replace(/\/+$/, '');
};

export default function DiagnosticsPanel() {
  const initialApiUrl =
    sanitizeUrl(process.env.NEXT_PUBLIC_API_URL) ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  const [apiUrl, setApiUrl] = useState(initialApiUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const envInfo = useMemo(
    () => [
      { label: 'NEXT_PUBLIC_API_URL', value: process.env.NEXT_PUBLIC_API_URL || '(non défini)' },
      { label: 'NEXT_PUBLIC_REQUIRE_AUTH', value: process.env.NEXT_PUBLIC_REQUIRE_AUTH ?? '(non défini)' },
      { label: 'NEXT_PUBLIC_BASE_PATH', value: process.env.NEXT_PUBLIC_BASE_PATH ?? '(non défini)' }
    ],
    []
  );

  const fetchHealth = async (target) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(target, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const json = await response.json();
      setResult(json);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialApiUrl) {
      fetchHealth(initialApiUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialApiUrl]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const target = sanitizeUrl(apiUrl || initialApiUrl);
    if (target) {
      fetchHealth(target);
    } else {
      setError('Veuillez renseigner une URL valide.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <section className="bg-white rounded-xl shadow p-6 border border-gray-100">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm text-primary font-semibold uppercase tracking-wider">Diagnostic temps réel</p>
            <h1 className="text-2xl font-bold text-gray-900">Statut API & Base de données</h1>
          </div>
          <span className="px-3 py-1 text-sm rounded-md bg-gray-100 text-gray-700 font-medium">
            Build {process.env.NODE_ENV === 'production' ? 'production' : 'local'}
          </span>
        </header>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="text-sm text-gray-600 font-medium">URL API à tester</label>
            <input
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="https://mon-api.com"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="self-end px-5 py-2 rounded-md bg-primary text-white font-semibold shadow disabled:opacity-60"
          >
            {loading ? 'Test en cours…' : 'Tester la connexion'}
          </button>
        </form>

        <div className="mt-6 rounded-lg border bg-gray-50 p-4 text-sm">
          <p className="text-gray-600">
            Cette vérification interroge l’endpoint racine de l’API (`index.php`) qui effectue déjà un diagnostic PDO/ Postgres.
          </p>
        </div>

        <div className="mt-6">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              ❌ Impossible de contacter l&rsquo;API : {error}
            </div>
          )}
          {result && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-gray-200 p-4 bg-white shadow-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">API</p>
                <h2 className="text-lg font-semibold text-gray-900">{result.service}</h2>
                <p className="text-sm text-gray-600">Version {result.version}</p>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Statut</dt>
                    <dd className="font-medium text-gray-900">{result.status}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">PHP</dt>
                    <dd className="font-medium text-gray-900">{result.php_version}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Base de données</dt>
                    <dd className="font-medium text-gray-900">{result.database}</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-lg border border-gray-200 p-4 bg-white shadow-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Horodatage</p>
                <p className="text-sm text-gray-900">{result.timestamp}</p>
                {lastUpdated && (
                  <p className="text-xs text-gray-500 mt-1">Vérifié le {lastUpdated.toLocaleString()}</p>
                )}
                <p className="text-xs text-gray-500 mt-4">
                  Endpoints exposés :
                </p>
                <ul className="mt-1 space-y-1 text-xs font-mono text-gray-700 max-h-36 overflow-auto">
                  {result.endpoints &&
                    Object.entries(result.endpoints).map(([route, desc]) => (
                      <li key={route}>
                        <span className="text-primary">{route}</span> — {desc}
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          )}
          {!result && !error && (
            <p className="text-sm text-gray-500">Aucun diagnostic pour le moment.</p>
          )}
        </div>
      </section>

      <section className="bg-white rounded-xl shadow p-6 border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Variables front exposées</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {envInfo.map((info) => (
            <div key={info.label} className="rounded-lg border border-gray-200 p-4 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{info.label}</p>
              <p className="mt-1 text-sm font-mono text-gray-900 break-all">{info.value}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

