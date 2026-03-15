const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function AgeGate({ birthMonth, birthYear, onChange }) {
  const currentYear = new Date().getFullYear()
  const years = []
  for (let y = currentYear - 18; y >= currentYear - 100; y--) {
    years.push(y)
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-sm text-brand-text-secondary mb-1.5 font-medium">Birth Month</label>
        <select
          value={birthMonth}
          onChange={(e) => onChange({ birthMonth: e.target.value, birthYear })}
          required
          className="w-full px-4 py-3 bg-brand-surface border border-brand-border rounded-lg text-brand-text focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent-glow appearance-none"
        >
          <option value="">Month</option>
          {MONTHS.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm text-brand-text-secondary mb-1.5 font-medium">Birth Year</label>
        <select
          value={birthYear}
          onChange={(e) => onChange({ birthMonth, birthYear: e.target.value })}
          required
          className="w-full px-4 py-3 bg-brand-surface border border-brand-border rounded-lg text-brand-text focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent-glow appearance-none"
        >
          <option value="">Year</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
