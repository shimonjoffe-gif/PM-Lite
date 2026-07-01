import { api } from './client'
import { AuthResponse, InvitationInfo } from '../types/auth'

export const authApi = {
  register: (data: {
    orgName: string
    email: string
    password: string
    fullName: string
  }) => api.post<AuthResponse>('/auth/register', data).then(r => r.data),

  join: (data: {
    orgSlug: string
    email: string
    password: string
    fullName: string
  }) => api.post<{ message: string }>('/auth/join', data).then(r => r.data),

  login: (data: { email: string; password: string }) =>
    api.post<AuthResponse>('/auth/login', data).then(r => r.data),

  verifyEmail: (token: string) =>
    api.get<{ message: string }>(`/auth/verify-email?token=${token}`).then(r => r.data),

  resendVerification: (email: string) =>
    api.post<{ message: string }>('/auth/resend-verification', { email }).then(r => r.data),

  getInvitation: (token: string) =>
    api.get<InvitationInfo>(`/invitations/${token}`).then(r => r.data),

  acceptInvitation: (token: string, data: { fullName: string; password: string }) =>
    api.post<AuthResponse>(`/invitations/${token}/accept`, data).then(r => r.data),

  forgotPassword: (email: string) =>
    api.post<{ message: string }>('/auth/forgot-password', { email }).then(r => r.data),

  resetPassword: (data: { token: string; password: string }) =>
    api.post<AuthResponse>('/auth/reset-password', data).then(r => r.data),
}
