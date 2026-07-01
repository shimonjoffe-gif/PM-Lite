import { ReactNode } from 'react'

interface FormFieldProps {
  label: string
  error?: string
  children: ReactNode
  required?: boolean
  labelRight?: ReactNode
}

export function FormField({ label, error, children, required, labelRight }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
        {labelRight}
      </div>
      {children}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
