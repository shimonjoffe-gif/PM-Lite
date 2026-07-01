import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RegisterPage } from './pages/auth/RegisterPage'
import { LoginPage } from './pages/auth/LoginPage'
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage'
import { AcceptInvitationPage } from './pages/auth/AcceptInvitationPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardHome } from './pages/DashboardPage'
import { TeamPage } from './pages/TeamPage'
import { RolesPage } from './pages/RolesPage'
import { OrgSettingsPage } from './pages/OrgSettingsPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { ProjectsPage } from './pages/projects/ProjectsPage'
import { CreateProjectPage } from './pages/projects/CreateProjectPage'
import { ProjectPage } from './pages/projects/ProjectPage'
import { MyTasksPage } from './pages/tasks/MyTasksPage'
import { ResourcesPage } from './pages/resources/ResourcesPage'
import { WorkSchedulePage } from './pages/resources/WorkSchedulePage'
import { ProductionCalendarPage } from './pages/resources/ProductionCalendarPage'
import { ResourceLoadPage } from './pages/resources/ResourceLoadPage'
import { ReportsPage } from './pages/reports/ReportsPage'
import { AiSettingsPage } from './pages/ai/AiSettingsPage'
import { GanttPage } from './pages/gantt/GanttPage'
import { PlannerPage } from './pages/planner/PlannerPage'
import { NormParamsPage } from './pages/templates/NormParamsPage'
import { TemplatesPage } from './pages/templates/TemplatesPage'
import { TemplateEditorPage } from './pages/templates/TemplateEditorPage'
import { CreateFromTemplatePage } from './pages/templates/CreateFromTemplatePage'
import { AssembleProjectPage } from './pages/templates/AssembleProjectPage'
import { DocumentsPage } from './pages/documents/DocumentsPage'
import { StorageSettingsPage } from './pages/settings/StorageSettingsPage'
import { DocAccessRulesPage } from './pages/settings/DocAccessRulesPage'
import { WorkCalendarPage } from './pages/WorkCalendarPage'
import { MyAbsencesPage } from './pages/MyAbsencesPage'
import { AbsenceRequestsPage } from './pages/AbsenceRequestsPage'
import { AbsenceSettingsPage } from './pages/AbsenceSettingsPage'
import { useAuthStore } from './store/authStore'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Публичные маршруты */}
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/invite/:token" element={<AcceptInvitationPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Защищённые маршруты — новый AppLayout */}
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<CreateProjectPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/tasks" element={<MyTasksPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/resources/work-schedule" element={<WorkSchedulePage />} />
          <Route path="/resources/calendar" element={<ProductionCalendarPage />} />
          <Route path="/resources/load" element={<ResourceLoadPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/ai/settings" element={<AiSettingsPage />} />
          <Route path="/projects/:projectId/gantt" element={<GanttPage />} />
          <Route path="/projects/:projectId/plan" element={<PlannerPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/templates/norm-params" element={<NormParamsPage />} />
          <Route path="/templates/assemble" element={<AssembleProjectPage />} />
          <Route path="/templates/:id" element={<TemplateEditorPage />} />
          <Route path="/templates/:id/create-project" element={<CreateFromTemplatePage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/dashboard/storage-settings" element={<StorageSettingsPage />} />
          <Route path="/dashboard/doc-access-rules" element={<DocAccessRulesPage />} />

          {/* Маршруты дашборда (старые, под новым layout) */}
          <Route path="/dashboard" element={<DashboardHome />} />
          <Route path="/dashboard/team" element={<TeamPage />} />
          <Route path="/dashboard/roles" element={<RolesPage />} />
          <Route path="/dashboard/settings" element={<OrgSettingsPage />} />
          <Route path="/dashboard/analytics" element={<AnalyticsPage />} />
          <Route path="/dashboard/work-calendar" element={<WorkCalendarPage />} />
          <Route path="/dashboard/my-absences" element={<MyAbsencesPage />} />
          <Route path="/dashboard/absence-requests" element={<AbsenceRequestsPage />} />
          <Route path="/dashboard/absence-settings" element={<AbsenceSettingsPage />} />
        </Route>

        {/* Редирект с корня */}
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
