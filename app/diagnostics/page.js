import DiagnosticsPanel from '@/components/DiagnosticsPanel';

export const metadata = {
  title: 'Diagnostics | OTT Dashboard',
  description: 'Statut API, base de données et variables frontend.'
};

export default function DiagnosticsPage() {
  return (
    <main className="min-h-screen bg-gray-100 py-12 px-4">
      <DiagnosticsPanel />
    </main>
  );
}

