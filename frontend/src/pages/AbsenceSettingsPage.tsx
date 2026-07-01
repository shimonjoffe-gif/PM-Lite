import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { absencesApi, AbsenceType, Department, ApprovalStep } from '@/api/absences'
import { usersApi } from '@/api/users'
import { Button } from '@/components/ui/Button'

const ROLE_LABELS: Record<string, string> = { pm: 'РП проекта', line_manager: 'Руководитель отдела', admin: 'Администратор' }
const ACTION_LABELS: Record<string, string> = { approve: 'Согласование', notify: 'Уведомление' }

// ─── Absence Type Step Editor ─────────────────────────────────────────────────

function StepEditor({ steps, onChange }: { steps: ApprovalStep[]; onChange: (s: ApprovalStep[]) => void }) {
  function addStep() {
    const order = (steps[steps.length - 1]?.order ?? 0) + 1
    onChange([...steps, { order, role: 'pm', action: 'approve' }])
  }
  function removeStep(i: number) { onChange(steps.filter((_, idx) => idx !== i)) }
  function updateStep(i: number, patch: Partial<ApprovalStep>) {
    onChange(steps.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }

  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-4">{i + 1}.</span>
          <select
            value={s.role}
            onChange={e => updateStep(i, { role: e.target.value as ApprovalStep['role'] })}
            className="rounded border border-gray-300 px-1.5 py-1 text-xs"
          >
            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select
            value={s.action}
            onChange={e => updateStep(i, { action: e.target.value as ApprovalStep['action'] })}
            className="rounded border border-gray-300 px-1.5 py-1 text-xs"
          >
            {Object.entries(ACTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={() => removeStep(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
        </div>
      ))}
      <button onClick={addStep} className="text-xs text-blue-600 hover:underline">+ добавить шаг</button>
      {steps.length === 0 && <p className="text-xs text-gray-400">Без согласования — фиксируется сразу</p>}
    </div>
  )
}

// ─── Absence Types Section ─────────────────────────────────────────────────────

function AbsenceTypesSection() {
  const qc = useQueryClient()
  const { data: types = [] } = useQuery({ queryKey: ['absence-types'], queryFn: absencesApi.getTypes })
  const [editingSteps, setEditingSteps] = useState<string | null>(null)
  const [draftSteps, setDraftSteps] = useState<ApprovalStep[]>([])
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6B7280')
  const [adding, setAdding] = useState(false)

  const createMut = useMutation({
    mutationFn: absencesApi.createType,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['absence-types'] }); setAdding(false); setNewName(''); setNewColor('#6B7280') },
  })
  const stepsMut = useMutation({
    mutationFn: ({ id, steps }: { id: string; steps: ApprovalStep[] }) => absencesApi.updateTypeSteps(id, steps),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['absence-types'] }); setEditingSteps(null) },
  })
  const deleteMut = useMutation({
    mutationFn: absencesApi.deleteType,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['absence-types'] }),
  })

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Типы отсутствий</h2>
        <Button size="sm" onClick={() => setAdding(v => !v)}>+ Добавить тип</Button>
      </div>

      {adding && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex gap-2 items-center">
          <input
            type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
            className="w-7 h-7 rounded cursor-pointer border border-gray-300"
          />
          <input
            placeholder="Название типа"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button size="sm" loading={createMut.isPending} onClick={() => createMut.mutate({ name: newName, color: newColor })}>
            Создать
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Отмена</Button>
        </div>
      )}

      <div className="space-y-2">
        {(types as AbsenceType[]).map(t => (
          <div key={t.id} className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                <span className="text-sm font-medium text-gray-800">{t.name}</span>
                {t.isSystem && <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">системный</span>}
              </div>
              <div className="flex gap-2">
                <button
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => { setEditingSteps(editingSteps === t.id ? null : t.id); setDraftSteps(t.approvalSteps) }}
                >
                  {editingSteps === t.id ? 'Свернуть' : 'Цепочка согласования'}
                </button>
                {!t.isSystem && (
                  <button className="text-xs text-red-500 hover:underline" onClick={() => deleteMut.mutate(t.id)}>
                    Удалить
                  </button>
                )}
              </div>
            </div>

            {/* Current steps summary */}
            {editingSteps !== t.id && t.approvalSteps.length > 0 && (
              <p className="text-xs text-gray-500">
                {t.approvalSteps.map(s => `${ROLE_LABELS[s.role]} (${ACTION_LABELS[s.action]})`).join(' → ')}
              </p>
            )}
            {editingSteps !== t.id && t.approvalSteps.length === 0 && (
              <p className="text-xs text-gray-400">Без согласования</p>
            )}

            {editingSteps === t.id && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <StepEditor steps={draftSteps} onChange={setDraftSteps} />
                <div className="flex gap-2">
                  <Button size="sm" loading={stepsMut.isPending} onClick={() => stepsMut.mutate({ id: t.id, steps: draftSteps })}>
                    Сохранить
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingSteps(null)}>Отмена</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Departments Section ──────────────────────────────────────────────────────

function buildTree(depts: Department[], parentId: string | null = null): (Department & { children: Department[] })[] {
  return depts
    .filter(d => d.parentId === parentId)
    .map(d => ({ ...d, children: buildTree(depts, d.id) as any }))
}

function DeptNode({
  dept, allUsers, depth, onEdit, onDelete,
}: {
  dept: Department & { children: Department[] }
  allUsers: { id: string; fullName: string; departmentId?: string | null }[]
  depth: number
  onEdit: (d: Department) => void
  onDelete: (id: string) => void
}) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const members = allUsers.filter(u => u.departmentId === dept.id)
  const nonMembers = allUsers.filter(u => u.departmentId !== dept.id)

  const assignMut = useMutation({
    mutationFn: ({ userId, deptId }: { userId: string; deptId: string | null }) =>
      absencesApi.assignUserDepartment(userId, deptId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); qc.invalidateQueries({ queryKey: ['org-users'] }) },
  })

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div className="flex items-center justify-between py-1.5 group">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded(v => !v)}>
          <span className="text-gray-400 text-xs">{expanded ? '▼' : '▶'}</span>
          <span className="text-sm text-gray-800 font-medium">{dept.name}</span>
          {dept.headUser && <span className="text-xs text-gray-500">— {dept.headUser.fullName}</span>}
          <span className="text-xs text-gray-400">({members.length} чел.)</span>
        </div>
        <div className="hidden group-hover:flex gap-2">
          <button className="text-xs text-blue-600 hover:underline" onClick={() => onEdit(dept)}>Изменить</button>
          <button className="text-xs text-red-500 hover:underline" onClick={() => onDelete(dept.id)}>Удалить</button>
        </div>
      </div>

      {expanded && (
        <div className="ml-5 mb-2 rounded-lg border border-gray-100 bg-gray-50 p-2 space-y-1.5">
          {members.length === 0 && <p className="text-xs text-gray-400">Нет участников</p>}
          {members.map(u => (
            <div key={u.id} className="flex items-center justify-between">
              <span className="text-xs text-gray-700">{u.fullName}</span>
              <button
                className="text-xs text-red-400 hover:text-red-600"
                onClick={() => assignMut.mutate({ userId: u.id, deptId: null })}
              >Убрать</button>
            </div>
          ))}
          {nonMembers.length > 0 && (
            <div className="pt-1 border-t border-gray-200 flex items-center gap-2">
              <select
                defaultValue=""
                className="flex-1 rounded border border-gray-300 bg-white px-1.5 py-1 text-xs"
                onChange={e => { if (e.target.value) { assignMut.mutate({ userId: e.target.value, deptId: dept.id }); e.target.value = '' } }}
              >
                <option value="">+ Добавить сотрудника</option>
                {nonMembers.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {dept.children.map(c => (
        <DeptNode key={c.id} dept={c as any} allUsers={allUsers} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  )
}

function DepartmentsSection() {
  const qc = useQueryClient()
  const { data: depts = [] } = useQuery({ queryKey: ['departments'], queryFn: absencesApi.getDepartments })
  const { data: usersData } = useQuery({ queryKey: ['org-users'], queryFn: () => usersApi.list() })
  const users = usersData?.users ?? []

  const [editing, setEditing] = useState<Department | null | 'new'>(null)
  const [form, setForm] = useState({ name: '', parentId: '' as string | null, headUserId: '' as string | null })

  const createMut = useMutation({
    mutationFn: absencesApi.createDepartment,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); setEditing(null) },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => absencesApi.updateDepartment(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); setEditing(null) },
  })
  const deleteMut = useMutation({
    mutationFn: absencesApi.deleteDepartment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  })

  function openEdit(d: Department) {
    setForm({ name: d.name, parentId: d.parentId, headUserId: d.headUserId })
    setEditing(d)
  }

  function save() {
    const payload = {
      name: form.name,
      parentId: form.parentId || null,
      headUserId: form.headUserId || null,
    }
    if (editing === 'new') createMut.mutate(payload)
    else if (editing) updateMut.mutate({ id: editing.id, data: payload })
  }

  const tree = buildTree(depts as Department[])

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Структура отделов</h2>
        <Button size="sm" onClick={() => { setForm({ name: '', parentId: null, headUserId: null }); setEditing('new') }}>
          + Добавить отдел
        </Button>
      </div>

      {(editing === 'new' || (editing && editing !== 'new')) && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
          <p className="text-xs font-medium text-gray-700">{editing === 'new' ? 'Новый отдел' : `Редактировать: ${(editing as Department).name}`}</p>
          <input
            placeholder="Название отдела"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Родительский отдел</label>
              <select
                value={form.parentId ?? ''}
                onChange={e => setForm(f => ({ ...f, parentId: e.target.value || null }))}
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">— корневой —</option>
                {(depts as Department[]).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Руководитель</label>
              <select
                value={form.headUserId ?? ''}
                onChange={e => setForm(f => ({ ...f, headUserId: e.target.value || null }))}
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">— не назначен —</option>
                {users.map((u: any) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" loading={createMut.isPending || updateMut.isPending} onClick={save}>Сохранить</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Отмена</Button>
          </div>
        </div>
      )}

      {depts.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">Отделы не созданы</p>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          {tree.map(d => (
            <DeptNode
              key={d.id}
              dept={d}
              allUsers={users.map((u: any) => ({ id: u.id, fullName: u.fullName, departmentId: u.departmentId ?? null }))}
              depth={0}
              onEdit={openEdit}
              onDelete={id => deleteMut.mutate(id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AbsenceSettingsPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">Настройки отсутствий</h1>
      <AbsenceTypesSection />
      <DepartmentsSection />
    </div>
  )
}
