'use client';

import { useEffect } from 'react';
import logger from '@/lib/logger';

export default function Error({ error, reset }) {
  useEffect(() => {
    logger.error('UI error boundary:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-3xl font-semibold text-gray-900">
          Oups, une erreur est survenue
        </h1>
        <p className="text-gray-600">
          L&apos;interface a rencontré un problème. Vous pouvez réessayer ou revenir à l&apos;accueil.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-2 rounded-md bg-primary text-white shadow-sm"
          >
            Réessayer
          </button>
          <a
            href="/"
            className="px-4 py-2 rounded-md border border-gray-300 text-gray-700"
          >
            Accueil
          </a>
        </div>
      </div>
    </div>
  );
}

