import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@/context/ThemeContext'
import { LangProvider } from '@/context/LangContext'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { DataProvider } from '@/context/DataContext'
import { Aurora } from '@/components/layout/Aurora'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/Login'
import { DashboardPage } from '@/pages/Dashboard'
import { ProjectsPage } from '@/pages/Projects'
import { ProjectDetailPage } from '@/pages/ProjectDetail'
import { AreaDetailPage } from '@/pages/AreaDetail'
import { TaskDetailPage } from '@/pages/TaskDetail'
import { StandardsPage } from '@/pages/Standards'
import { WarningsPage } from '@/pages/Warnings'
import { AssistantPage } from '@/pages/Assistant'
import { SettingsPage } from '@/pages/Settings'

export default function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <AuthProvider>
          <Aurora />
          <BrowserRouter>
            <Gate />
          </BrowserRouter>
        </AuthProvider>
      </LangProvider>
    </ThemeProvider>
  )
}

/** Belum login (atau masih terkunci) -> layar login. Sisanya masuk app shell. */
function Gate() {
  const { account, locked } = useAuth()

  if (!account || locked) return <LoginPage />

  return (
    <DataProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route
            path="/projects/:projectId/buildings/:buildingId/areas/:areaId"
            element={<AreaDetailPage />}
          />
          <Route
            path="/projects/:projectId/buildings/:buildingId/areas/:areaId/tasks/:taskId"
            element={<TaskDetailPage />}
          />
          <Route path="/standards" element={<StandardsPage />} />
          <Route path="/warnings" element={<WarningsPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </DataProvider>
  )
}
