import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import { AppShell } from "@/components/AppShell";

import { LoginPage } from "@/views/login/LoginPage";
import { DashboardPage } from "@/views/dashboard/DashboardPage";
import { ProjectsPage } from "@/views/projects/ProjectsPage";
import { ProjectOverviewPage } from "@/views/projects/ProjectOverviewPage";
import { PlaceholderPage } from "@/views/placeholder/PlaceholderPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectOverviewPage />} />

          <Route
            path="/runs"
            element={<PlaceholderPage title="Test Runs" />}
          />

          <Route
            path="/reports"
            element={<PlaceholderPage title="Reports" />}
          />

          <Route
            path="/settings"
            element={<PlaceholderPage title="Settings" />}
          />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}