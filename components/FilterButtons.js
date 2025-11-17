/**
 * Composant de boutons de filtre réutilisable
 * @module components/FilterButtons
 */

export default function FilterButtons({ 
  options, 
  selected, 
  onChange, 
  className = '',
  getLabel = (value) => value 
}) {
  return (
    <div className={`flex gap-2 flex-wrap ${className}`}>
      {options.map(option => {
        const value = typeof option === 'string' ? option : option.value
        const label = typeof option === 'string' ? getLabel(option) : option.label
        const isSelected = selected === value

        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              isSelected
                ? 'bg-primary-500 text-white shadow-lg scale-105'
                : 'bg-white dark:bg-[rgb(var(--night-surface))] text-gray-700 dark:text-[rgb(var(--night-text-primary))] hover:bg-gray-100 dark:hover:bg-[rgb(var(--night-surface-hover))]'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

