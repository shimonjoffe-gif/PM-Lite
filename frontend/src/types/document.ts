export type DocumentParentType = 'project' | 'task' | 'client'

export interface DocumentTypeCategory {
  id: string
  code: string
  name: string
  sortOrder: number
}

export interface DocumentType {
  id: string
  organizationId: string | null
  categoryId: string
  categoryName: string
  name: string
  code: string | null
  isSystem: boolean
  isArchived: boolean
  sortOrder: number
}

export interface DocumentTypesGrouped {
  category: DocumentTypeCategory
  types: DocumentType[]
}

export interface DocumentVersion {
  id: string
  documentId: string
  versionNumber: number
  fileName: string
  fileSize: number | null
  mimeType: string | null
  externalUrl: string | null
  checksum: string | null
  comment: string | null
  createdBy: string
  createdByName: string
  createdAt: string
}

export interface Document {
  id: string
  organizationId: string
  title: string
  description: string | null
  documentTypeId: string
  documentTypeName: string
  documentTypeCategoryName: string
  parentType: DocumentParentType
  parentId: string
  projectId: string | null
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  latestVersion: DocumentVersion | null
}

export interface DocumentListResponse {
  items: Document[]
  total: number
  page: number
  limit: number
}

export interface AccessRule {
  id: string
  organizationId: string
  projectId: string | null
  documentTypeId: string | null
  orgRoleId: string
  orgRoleName: string
  canView: boolean
  canUpload: boolean
}

export interface StorageSettings {
  id: string
  organizationId: string
  storageMode: 'cloud' | 'external'
  pluginUrl: string | null
  pluginVerifiedAt: string | null
  pluginVersion: string | null
}
