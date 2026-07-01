import { api } from './client'

export const userPrefsApi = {
  getColumns: async (table: string): Promise<{ tableName: string; columns: string[] }> => {
    const res = await api.get(`/user-prefs/columns/${table}`)
    return res.data
  },

  setColumns: async (table: string, columns: string[]): Promise<{ tableName: string; columns: string[] }> => {
    const res = await api.put(`/user-prefs/columns/${table}`, { columns })
    return res.data
  },
}
