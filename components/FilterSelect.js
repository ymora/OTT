/**
 * Composant de sélection de filtre réutilisable
 * @module components/FilterSelect
 */

export default function FilterSelect({ 
  value, 
  onChange, 
  options, 
  placeholder = 'Sélectionner...',
  className = '',
  getLabel = (option) => option.label || option.name || option
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`input ${className}`}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((option, index) => {
        const optionValue = option.value !== undefined ? option.value : option.id || option
        const optionLabel = getLabel(option)
        return (
          <option key={optionValue || index} value={optionValue}>
            {optionLabel}
          </option>
        )
      })}
    </select>
  )
}

