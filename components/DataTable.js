/**
 * Composant de table générique réutilisable
 * Centralise la structure des tables pour éviter les duplications
 */

import LoadingSpinner from './LoadingSpinner'

/**
 * Composant DataTable générique
 * @param {Object} props
 * @param {Array} props.columns - Définition des colonnes [{ key, label, render? }]
 * @param {Array} props.data - Données à afficher
 * @param {boolean} props.loading - État de chargement
 * @param {string} props.emptyMessage - Message si aucune donnée
 * @param {string} props.className - Classes CSS supplémentaires
 */
export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  emptyMessage = 'Aucune donnée',
  className = ''
}) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`text-left py-3 px-4 ${column.headerClassName || ''}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-gray-500">
                <LoadingSpinner size="sm" text="Chargement..." />
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr
                key={row.id || rowIndex}
                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {columns.map((column) => {
                  const cellValue = row[column.key]
                  
                  return (
                    <td
                      key={column.key}
                      className={`py-3 px-4 ${column.cellClassName || ''}`}
                    >
                      {column.render
                        ? column.render(cellValue, row, rowIndex)
                        : cellValue !== null && cellValue !== undefined
                        ? String(cellValue)
                        : '-'}
                    </td>
                  )
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

