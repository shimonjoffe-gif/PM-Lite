import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { docAccessRulesApi, UpsertRule } from '@/api/docAccessRules'
import { documentsApi } from '@/api/documents'
import { rolesApi } from '@/api/roles'
import { AccessRule, DocumentType } from '@/types/document'
import { Button } from '@/components/ui/Button'

interface RuleState {
  orgRoleId: string
  orgRoleName: string
  documentTypeId: string
  canView: boolean
  canUpload: boolean
}

function buildMatrix(rules: AccessRule[], roles: { id: string; name: string }[], types: DocumentType[]): RuleState[] {
  // Start with existing rules
  const map = new Map<string, RuleState>()
  for (const r of rules) {
    const key = `${r.orgRoleId}__${r.documentTypeId ?? 'null'}`
    map.set(key, {
      orgRoleId: r.orgRoleId,
      orgRoleName: r.orgRoleName,
      documentTypeId: r.documentTypeId,
      canView: r.canView,
      canUpload: r.canUpload,
    })
  }
  return Array.from(map.values())
}

export function DocAccessRulesPage() {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [localRules, setLocalRules] = useState<RuleState[]>([])
  const [initialized, setInitialized] = useState(false)

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ['doc-access-rules', 'org'],
    queryFn: () => docAccessRulesApi.getOrg(),
  })

  const { data: typesData } = useQuery({
    queryKey: ['document-types'],
    queryFn: () => documentsApi.listTypes(),
  })

  const { data: rolesData } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['roles'],
    queryFn: () => rolesApi.list(),
  })

  const allTypes: DocumentType[] = typesData?.items.flatMap(g => g.types) ?? []

  useEffect(() => {
    if (rulesData && rolesData && allTypes.length > 0 && !initialized) {
      // Build full matrix: all role×type combinations with defaults
      // Explicit rule overrides the default (canView=true, canUpload=false)
      const explicitMap = new Map<string, { canView: boolean; canUpload: boolean }>()
      for (const r of rulesData) {
        if (r.documentTypeId) {
          explicitMap.set(`${r.orgRoleId}__${r.documentTypeId}`, { canView: r.canView, canUpload: r.canUpload })
        }
      }
      const full: RuleState[] = []
      for (const role of (rolesData as { id: string; name: string }[])) {
        for (const type of allTypes) {
          const key = `${role.id}__${type.id}`
          const explicit = explicitMap.get(key)
          full.push({
            orgRoleId: role.id,
            orgRoleName: role.name,
            documentTypeId: type.id,
            canView: explicit ? explicit.canView : true,
            canUpload: explicit ? explicit.canUpload : false,
          })
        }
      }
      setLocalRules(full)
      setInitialized(true)
    }
  }, [rulesData, rolesData, allTypes, initialized])

  const save = useMutation({
    mutationFn: () => docAccessRulesApi.putOrg(localRules.map(r => ({
      orgRoleId: r.orgRoleId,
      documentTypeId: r.documentTypeId,
      canView: r.canView,
      canUpload: r.canUpload,
    }))),
    onSuccess: () => {
      setInitialized(false)
      qc.invalidateQueries({ queryKey: ['doc-access-rules', 'org'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const toggle = (roleId: string, typeId: string, field: 'canView' | 'canUpload') => {
    setLocalRules(prev => {
      const key = (r: RuleState) => r.orgRoleId === roleId && r.documentTypeId === typeId
      const existing = prev.find(key)
      if (existing) {
        return prev.map(r => key(r) ? { ...r, [field]: !r[field], ...(field === 'canView' && r.canView ? { canUpload: false } : {}) } : r)
      }
      const role = rolesData?.find((r: any) => r.id === roleId)
      return [...prev, {
        orgRoleId: roleId,
        orgRoleName: role?.name ?? '',
        documentTypeId: typeId,
        canView: field === 'canView',
        canUpload: field === 'canUpload',
      }]
    })
  }

  const toggleCategory = (roleId: string, typeIds: string[], field: 'canView' | 'canUpload', value: boolean) => {
    setLocalRules(prev => {
      const role = rolesData?.find((r: any) => r.id === roleId)
      const next = [...prev]
      for (const typeId of typeIds) {
        const idx = next.findIndex(r => r.orgRoleId === roleId && r.documentTypeId === typeId)
        const update: Partial<RuleState> = { [field]: value }
        if (field === 'canView' && !value) update.canUpload = false
        if (idx >= 0) {
          next[idx] = { ...next[idx], ...update }
        } else {
          next.push({ orgRoleId: roleId, orgRoleName: role?.name ?? '', documentTypeId: typeId, canView: false, canUpload: false, ...update })
        }
      }
      return next
    })
  }

  const getRule = (roleId: string, typeId: string) =>
    localRules.find(r => r.orgRoleId === roleId && r.documentTypeId === typeId)

  const getCategoryState = (roleId: string, typeIds: string[], field: 'canView' | 'canUpload') => {
    const checked = typeIds.filter(id => getRule(roleId, id)?.[field] ?? false)
    if (checked.length === 0) return false
    if (checked.length === typeIds.length) return true
    return 'indeterminate' as const
  }

  if (rulesLoading) return <p className="text-sm text-gray-400">Загрузка...</p>

  const roles: { id: string; name: string }[] = rolesData ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Права доступа к документам</h1>
          <p className="text-sm text-gray-400 mt-0.5">Org-умолчания. PM может переопределить на уровне проекта.</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600">Сохранено</span>}
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Сохранить
          </Button>
        </div>
      </div>

      {typesData?.items.map(group => {
        const catTypeIds = group.types.map(t => t.id)
        return (
        <div key={group.category.id} className="mb-6">
          <p className="text-sm font-semibold text-gray-600 mb-2">{group.category.name}</p>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-52">Тип документа</th>
                  {roles.map(role => (
                    <th key={role.id} className="text-center px-4 py-3 text-xs font-medium text-gray-500" colSpan={2}>
                      {role.name}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-2" />
                  {roles.map(role => (
                    <>
                      <th key={`${role.id}-v`} className="text-center px-2 py-2 text-[10px] text-gray-400 font-medium">Просмотр</th>
                      <th key={`${role.id}-u`} className="text-center px-2 py-2 text-[10px] text-gray-400 font-medium">Загрузка</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {/* All types in category row — bulk toggle */}
                <tr className="bg-blue-50/30">
                  <td className="px-4 py-2.5 text-xs font-medium text-blue-700 italic">Все типы категории</td>
                  {roles.map(role => {
                    const vState = getCategoryState(role.id, catTypeIds, 'canView')
                    const uState = getCategoryState(role.id, catTypeIds, 'canUpload')
                    return (
                      <>
                        <td key={`${role.id}-cat-v`} className="text-center px-2 py-2.5">
                          <Checkbox
                            checked={vState === true}
                            indeterminate={vState === 'indeterminate'}
                            onChange={() => toggleCategory(role.id, catTypeIds, 'canView', vState !== true)}
                          />
                        </td>
                        <td key={`${role.id}-cat-u`} className="text-center px-2 py-2.5">
                          <Checkbox
                            checked={uState === true}
                            indeterminate={uState === 'indeterminate'}
                            onChange={() => toggleCategory(role.id, catTypeIds, 'canUpload', uState !== true)}
                            disabled={vState === false}
                          />
                        </td>
                      </>
                    )
                  })}
                </tr>
                {group.types.map(type => (
                  <tr key={type.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-xs text-gray-700">{type.name}</td>
                    {roles.map(role => {
                      const rule = getRule(role.id, type.id)
                      return (
                        <>
                          <td key={`${role.id}-${type.id}-v`} className="text-center px-2 py-2.5">
                            <Checkbox checked={rule?.canView ?? false} onChange={() => toggle(role.id, type.id, 'canView')} />
                          </td>
                          <td key={`${role.id}-${type.id}-u`} className="text-center px-2 py-2.5">
                            <Checkbox checked={rule?.canUpload ?? false} onChange={() => toggle(role.id, type.id, 'canUpload')} disabled={!(rule?.canView ?? false)} />
                          </td>
                        </>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )
      })}

      <div className="text-xs text-gray-400 mt-2 space-y-0.5">
        <p>• Если правило не задано — по умолчанию Просмотр: да, Загрузка: нет.</p>
        <p>• Загрузка недоступна без права просмотра.</p>
        <p>• «Все типы категории» — массово выставляет права для всех типов данной категории.</p>
      </div>
    </div>
  )
}

function Checkbox({ checked, indeterminate = false, onChange, disabled = false }: { checked: boolean; indeterminate?: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onChange}
      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors mx-auto ${
        disabled
          ? 'border-gray-100 bg-gray-50 cursor-not-allowed'
          : checked || indeterminate
          ? 'border-blue-500 bg-blue-500'
          : 'border-gray-300 hover:border-blue-400'
      }`}
    >
      {!disabled && checked && (
        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      )}
      {!disabled && indeterminate && !checked && (
        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" />
        </svg>
      )}
    </button>
  )
}
