import { api } from './client'
import { StorageSettings } from '../types/document'

export const storageSettingsApi = {
  get: async (): Promise<StorageSettings> => {
    const r = await api.get('/storage-settings')
    return r.data
  },

  update: async (data: { storageMode: 'cloud' | 'external'; pluginUrl?: string; apiKey?: string }): Promise<StorageSettings> => {
    const r = await api.put('/storage-settings', data)
    return r.data
  },

  verify: async (apiKey: string): Promise<{ ok: boolean; version?: string; error?: string }> => {
    const r = await api.post('/storage-settings/verify', { apiKey })
    return r.data
  },
}
