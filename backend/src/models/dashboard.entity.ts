import { ProjectSummary } from './project.entity';

export interface DashboardData {
  projects: number;
  testCases: number;
  passed: number;
  failed: number;
  recentProjects: ProjectSummary[];
}
