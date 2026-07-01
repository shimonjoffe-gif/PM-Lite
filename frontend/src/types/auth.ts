export interface User {
  id: string
  email: string
  fullName: string
  isAdmin: boolean
  orgRoleId: string | null
  roleName: string | null
  organizationId: string
  emailVerifiedAt: string | null
  isActive: boolean
}

export interface AuthResponse {
  token: string
  user: User
}

export interface InvitationInfo {
  id: string
  email: string
  roleName: string | null
  orgName: string
  inviterName: string
  expiresAt: string
}
