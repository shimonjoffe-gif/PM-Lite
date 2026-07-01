import { api } from './client'

export const invitationsApi = {
  send: (data: { email: string; orgRoleId: string }) =>
    api.post<{ id: string; message: string }>('/invitations', data).then(r => r.data),
}
