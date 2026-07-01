import { create } from 'zustand'
import type { AiPanelMode } from '@/types/ai'

interface AiPanelState {
  isOpen: boolean
  mode: AiPanelMode
  result: string | null
  isLoading: boolean
  open: (mode: AiPanelMode) => void
  close: () => void
  setResult: (text: string | null) => void
  setLoading: (v: boolean) => void
}

export const useAiPanel = create<AiPanelState>(set => ({
  isOpen: false,
  mode: { type: 'idle' },
  result: null,
  isLoading: false,
  open: mode => set({ isOpen: true, mode, result: null, isLoading: false }),
  close: () => set({ isOpen: false, result: null, isLoading: false }),
  setResult: result => set({ result, isLoading: false }),
  setLoading: isLoading => set({ isLoading }),
}))
