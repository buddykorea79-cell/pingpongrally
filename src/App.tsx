import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { ToastProvider, BallLoader } from '@/components/ui/Feedback'
import { ConfirmProvider } from '@/components/ui/Overlay'
import { useSession, useThemeSync } from '@/lib/hooks'
import Home from '@/pages/Home'

// 교육생 화면은 가볍게, 강사·발표 화면은 필요할 때만 불러온다(설계서 5.4).
const Join = lazy(() => import('@/pages/rally/Join'))
const Register = lazy(() => import('@/pages/rally/Register'))
const Rally = lazy(() => import('@/pages/rally/Rally'))
const SurveyRespond = lazy(() => import('@/pages/rally/SurveyRespond'))
const Me = lazy(() => import('@/pages/rally/Me'))
const Privacy = lazy(() => import('@/pages/Privacy'))
const Terms = lazy(() => import('@/pages/Terms'))
const NotFound = lazy(() => import('@/pages/NotFound'))
const HostLogin = lazy(() => import('@/pages/host/Login'))
const Dashboard = lazy(() => import('@/pages/host/Dashboard'))
const Control = lazy(() => import('@/pages/host/Control'))
const Manage = lazy(() => import('@/pages/host/Manage'))
const Attendance = lazy(() => import('@/pages/host/Attendance'))
const SurveyResults = lazy(() => import('@/pages/host/SurveyResults'))
const TemplateEditor = lazy(() => import('@/pages/host/TemplateEditor'))
const PingSetEditor = lazy(() => import('@/pages/host/PingSetEditor'))
const Present = lazy(() => import('@/pages/present/Present'))

function RequireHost({ children }: { children: ReactNode }) {
  const { session, loading } = useSession()
  const loc = useLocation()
  if (loading) return <BallLoader className="min-h-dvh" />
  if (!session || session.isAnonymous) {
    return <Navigate to={`/host/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  }
  return <>{children}</>
}

export default function App() {
  useThemeSync()
  return (
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <Suspense fallback={<BallLoader className="min-h-dvh" />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/j/:code" element={<Join />} />
              <Route path="/reg/:token" element={<Register />} />
              <Route path="/r/:roomId" element={<Rally />} />
              <Route path="/r/:roomId/survey/:surveyId" element={<SurveyRespond />} />
              <Route path="/r/:roomId/me" element={<Me />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/host/login" element={<HostLogin />} />
              <Route path="/host" element={<RequireHost><Dashboard /></RequireHost>} />
              <Route path="/host/rooms/:id" element={<RequireHost><Control /></RequireHost>} />
              <Route path="/host/rooms/:id/manage" element={<RequireHost><Manage /></RequireHost>} />
              <Route path="/host/rooms/:id/attendance" element={<RequireHost><Attendance /></RequireHost>} />
              <Route path="/host/rooms/:id/surveys" element={<RequireHost><SurveyResults /></RequireHost>} />
              <Route path="/host/templates/:id" element={<RequireHost><TemplateEditor /></RequireHost>} />
              <Route path="/host/ping-sets/:id" element={<RequireHost><PingSetEditor /></RequireHost>} />
              <Route path="/present/:roomId" element={<RequireHost><Present /></RequireHost>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
