import { useState, useRef, useEffect } from 'react'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function CustomSelect({ value, onChange, placeholder, options }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = options.find(o => String(o.value) === String(value))

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full px-4 py-3 bg-brand-surface border rounded-lg flex items-center justify-between transition-colors ${open ? 'border-brand-accent ring-2 ring-brand-accent/30' : 'border-brand-border'}`}
      >
        <span className={selected ? 'text-brand-text' : 'text-brand-muted'}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className={`w-4 h-4 text-brand-muted transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-brand-card border border-brand-border rounded-lg shadow-xl overflow-hidden">
          <div className="max-h-52 overflow-y-auto">
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onChange(String(o.value)); setOpen(false) }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${String(o.value) === String(value) ? 'bg-brand-accent text-white' : 'text-brand-text hover:bg-brand-surface'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AgeGate({ birthMonth, birthYear, onChange }) {
  const currentYear = new Date().getFullYear()
  const years = []
  for (let y = currentYear - 18; y >= currentYear - 100; y--) {
    years.push({ value: y, label: String(y) })
  }
  const months = MONTHS.map((m, i) => ({ value: i + 1, label: m }))

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-sm text-brand-text-secondary mb-1.5 font-medium">Birth Month</label>
        <CustomSelect
          value={birthMonth}
          onChange={v => onChange({ birthMonth: v, birthYear })}
          placeholder="Month"
          options={months}
        />
      </div>
      <div>
        <label className="block text-sm text-brand-text-secondary mb-1.5 font-medium">Birth Year</label>
        <CustomSelect
          value={birthYear}
          onChange={v => onChange({ birthMonth, birthYear: v })}
          placeholder="Year"
          options={years}
        />
      </div>
    </div>
  )
}
