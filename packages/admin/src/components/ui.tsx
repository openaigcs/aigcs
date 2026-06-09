// Kumo-style UI components

export function PrimaryButton({ children, onClick, disabled, type, className = '', title }: {
  children: React.ReactNode
  onClick?: (e?: any) => void
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
  title?: string
}) {
  return (
    <button
      type={type || 'button'}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`cursor-pointer whitespace-nowrap bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium ${className}`}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ children, onClick, disabled, type, className = '', title }: {
  children: React.ReactNode
  onClick?: (e?: any) => void
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
  title?: string
}) {
  return (
    <button
      type={type || 'button'}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`cursor-pointer whitespace-nowrap bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium ${className}`}
    >
      {children}
    </button>
  )
}

export function DangerButton({ children, onClick, disabled, type, className = '', title }: {
  children: React.ReactNode
  onClick?: (e?: any) => void
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
  title?: string
}) {
  return (
    <button
      type={type || 'button'}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`cursor-pointer whitespace-nowrap bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium ${className}`}
    >
      {children}
    </button>
  )
}

export function Input({ value, onChange, placeholder, type = 'text', required, minLength, maxLength, readOnly, multiline, className = '', ...rest }: {
  value: string | number
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  minLength?: number
  maxLength?: number
  readOnly?: boolean
  multiline?: boolean
  className?: string
  [key: string]: any
}) {
  const base = `w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm ${className}`
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        readOnly={readOnly}
        className={base}
        {...rest}
      />
    )
  }
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      minLength={minLength}
      maxLength={maxLength}
      readOnly={readOnly}
      className={base}
      {...rest}
    />
  )
}

export function Select({ value, onChange, children, className = '' }: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm ${className}`}
    >
      {children}
    </select>
  )
}

export function Card({ title, children, className = '' }: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 ${className}`}>
      {title && <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>}
      <div className="p-5">
        {children}
      </div>
    </div>
  )
}

export function Toggle({ checked, onChange, disabled }: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <label className={`inline-flex items-center ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={disabled ? undefined : onChange} disabled={disabled} />
      <div className="relative w-9 h-5 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
    </label>
  )
}

export function Badge({ children, color = 'blue' }: {
  children: React.ReactNode
  color?: 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'gray'
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    green: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  }
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${colors[color] || colors.blue}`}>
      {children}
    </span>
  )
}
