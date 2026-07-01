import { ReactNode } from 'react'
import clsx from 'clsx'

interface AlertProps {
  variant?: 'error' | 'success' | 'info'
  children: ReactNode
}

export function Alert({ variant = 'error', children }: AlertProps) {
  return (
    <div
      className={clsx('rounded-lg px-4 py-3 text-sm', {
        'bg-red-50 text-red-700 border border-red-200': variant === 'error',
        'bg-green-50 text-green-700 border border-green-200': variant === 'success',
        'bg-blue-50 text-blue-700 border border-blue-200': variant === 'info',
      })}
    >
      {children}
    </div>
  )
}
