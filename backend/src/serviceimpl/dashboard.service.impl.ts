import { Injectable } from '@nestjs/common';
import { DashboardData } from '../models/dashboard.entity';
import { ProjectRepository } from '../repo/project.repository';
import { DashboardService } from '../service/dashboard.service';

@Injectable()
export class DashboardServiceImpl implements DashboardService {
  constructor(private readonly projects: ProjectRepository) {}

  async getOverview(): Promise<DashboardData> {
    const recentProjects = await this.projects.findAll();
    return {
      projects: recentProjects.length,
      testCases: recentProjects.reduce((total, project) => total + project.cases, 0),
      passed: recentProjects.reduce((total, project) => total + project.passed, 0),
      failed: recentProjects.reduce((total, project) => total + project.failed, 0),
      recentProjects: recentProjects.slice(0, 5),
    };
  }
}
