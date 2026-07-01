import { InputHTMLAttributes, forwardRef } from 'react'
import clsx from 'clsx'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        'h-11 w-full rounded-lg border bg-white px-3 text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500',
        error ? 'border-red-400 focus:ring-red-400' : 'border-gray-300',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
