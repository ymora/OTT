/**
 * Composant de barre de recherche réutilisable
 * @module components/SearchBar
 */

export default function SearchBar({ value, onChange, placeholder = 'Rechercher...', className = '' }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`input ${className}`}
      placeholder={placeholder}
    />
  )
}

