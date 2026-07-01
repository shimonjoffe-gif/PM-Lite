import { useState, useRef, useEffect } from 'react'
import { DayPicker, DateRange } from 'react-day-picker'
import { ru } from 'date-fns/locale'
import { addDays, endOfMonth, startOfMonth, format } from 'date-fns'
import 'react-day-picker/dist/style.css'

interface Props {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  placeholder?: string
  disabled?: boolean
}

const PRESETS = [
  { label: '7 дней', days: 7 },
  { label: '14 дней', days: 14 },
  { label: 'Месяц', days: null },
]

function formatRange(range: DateRange | undefined): string {
  if (!range?.from) return ''
  const from = format(range.from, 'dd.MM.yyyy')
  if (!range.to) return `${from} — ...`
  return `${from} — ${format(range.to, 'dd.MM.yyyy')}`
}

export function DateRangePicker({ value, onChange, placeholder = 'Выберите период', disabled }: Props) {
  const [open, setOpen] = useState(false)
  // internal draft — committed only on OK
  const [draft, setDraft] = useState<DateRange | undefined>(value)
  const ref = useRef<HTMLDivElement>(null)

  // sync draft when external value changes or popup opens
  useEffect(() => { if (open) setDraft(value) }, [open])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function applyPreset(days: number | null) {
    // use already-selected start date, fall back to today
    const from = draft?.from ?? (() => { const d = new Date(); d.setHours(0,0,0,0); return d })()
    const to = days ? addDays(from, days - 1) : endOfMonth(startOfMonth(from))
    setDraft({ from, to })
  }

  function confirm() {
    onChange(draft)
    setOpen(false)
  }

  function clear() {
    setDraft(undefined)
    onChange(undefined)
  }

  const canConfirm = !!(draft?.from && draft?.to)

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={[
          'w-full flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm text-left',
          'focus:outline-none focus:ring-2 focus:ring-blue-500',
          value?.from ? 'border-gray-300 text-gray-900' : 'border-gray-300 text-gray-400',
          disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'bg-white hover:border-gray-400',
        ].join(' ')}
      >
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="flex-1 truncate">{value?.from ? formatRange(value) : placeholder}</span>
        {value?.from && (
          <span
            role="button"
            tabIndex={0}
            className="text-gray-400 hover:text-gray-600"
            onMouseDown={e => { e.stopPropagation(); clear() }}
          >✕</span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-white rounded-xl shadow-xl border border-gray-200 p-3 space-y-3">

          {/* Быстрые пресеты */}
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <span className="text-xs text-gray-400 mr-1">
              {draft?.from && !draft?.to
                ? `от ${format(draft.from, 'dd.MM')}:`
                : 'Быстро:'}
            </span>
            {PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.days)}
                className="px-3 py-1 rounded-md text-xs font-medium bg-gray-100 hover:bg-blue-100 hover:text-blue-700 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Подсказка */}
          <p className="text-xs text-gray-400">
            {!draft?.from
              ? 'Нажмите на дату начала'
              : !draft?.to
              ? 'Нажмите на дату окончания или выберите длительность выше'
              : 'Диапазон выбран — нажмите ОК'}
          </p>

          <DayPicker
            mode="range"
            numberOfMonths={2}
            locale={ru}
            selected={draft}
            onSelect={setDraft}
            classNames={{
              months: 'flex gap-6',
              day_selected: 'bg-blue-500 text-white rounded',
              day_range_middle: 'bg-blue-100 text-blue-900 rounded-none',
              day_range_start: 'bg-blue-500 text-white rounded-l-full',
              day_range_end: 'bg-blue-500 text-white rounded-r-full',
              day_today: 'font-bold text-blue-600',
              nav_button: 'text-gray-500 hover:text-gray-800',
            }}
          />

          {/* Подвал: отмена + ОК */}
          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={!canConfirm}
              onClick={confirm}
              className={[
                'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                canConfirm
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed',
              ].join(' ')}
            >
              ОК
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
