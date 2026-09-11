import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../config/supabase.config';
import { CreateProjectDto } from '../dto/project/create-project.dto';
import { UpdateProjectDto } from '../dto/project/update-project.dto';
import { ProjectDetail, ProjectSummary, SuiteSummary } from '../models/project.entity';
import { ProjectOverviewRow, SuiteOverviewRow } from '../schema/project.schema';

const now = () => new Date().toISOString();

const initialDemoProject: ProjectDetail = {
  id: 'demo-project',
  name: 'SRM Website Testing',
  baseUrl: 'https://www.srmist.edu.in/',
  description: 'Automated tests for the public SRM Institute website.',
  suites: 3,
  cases: 3,
  passed: 3,
  failed: 0,
  passRate: 100,
  lastRun: now(),
  lastRunBy: 'QA User',
  suitesList: ['Admissions', 'Academics', 'Homepage'].map((name, index) => ({
    id: `demo-suite-${index + 1}`,
    name,
    cases: 1,
    passed: 1,
    failed: 0,
    notRun: 0,
    passRate: 100,
    lastRun: now(),
    lastRunBy: 'QA User',
  })),
};

@Injectable()
export class ProjectRepository {
  private readonly demoProjects = new Map<string, ProjectDetail>([
    [initialDemoProject.id, initialDemoProject],
  ]);

  constructor(private readonly db: SupabaseService) {}

  async findAll(): Promise<ProjectSummary[]> {
    if (!this.db.client) {
      return [...this.demoProjects.values()].map(({ suitesList: _suitesList, ...project }) => project);
    }

    const { data, error } = await this.db.client
      .from('project_overview')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map((project) => this.mapProject(project));
  }

  async findById(id: string): Promise<ProjectDetail> {
    if (!this.db.client) {
      const project = this.demoProjects.get(id);
      if (!project) throw new NotFoundException('Project not found');
      return project;
    }

    const { data: project, error } = await this.db.client
      .from('project_overview')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !project) throw new NotFoundException('Project not found');

    const { data: suites, error: suiteError } = await this.db.client
      .from('suite_overview')
      .select('*')
      .eq('project_id', id)
      .order('name');

    if (suiteError) throw suiteError;

    return {
      ...this.mapProject(project),
      description: project.description ?? null,
      suitesList: (suites ?? []).map((suite) => this.mapSuite(suite)),
    };
  }

  async create(input: CreateProjectDto): Promise<ProjectDetail> {
    if (!this.db.client) {
      const id = `demo-${Date.now()}`;
      const project: ProjectDetail = {
        id,
        name: input.name,
        baseUrl: input.baseUrl,
        description: input.description?.trim() || null,
        suites: 0,
        cases: 0,
        passed: 0,
        failed: 0,
        passRate: 0,
        lastRun: null,
        lastRunBy: null,
        suitesList: [],
      };
      this.demoProjects.set(id, project);
      return project;
    }

    const { data, error } = await this.db.client
      .from('projects')
      .insert({
        name: input.name,
        base_url: input.baseUrl,
        description: input.description?.trim() || null,
      })
      .select('id')
      .single();

    if (error || !data) throw error ?? new Error('Could not create project');
    return this.findById(data.id);
  }

  async update(id: string, input: UpdateProjectDto): Promise<ProjectDetail> {
    if (!this.db.client) {
      const existing = this.demoProjects.get(id);
      if (!existing) throw new NotFoundException('Project not found');
      const updated: ProjectDetail = {
        ...existing,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      };
      this.demoProjects.set(id, updated);
      return updated;
    }

    const changes: Record<string, unknown> = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.baseUrl !== undefined) changes.base_url = input.baseUrl;
    if (input.description !== undefined) changes.description = input.description;

    const { error } = await this.db.client.from('projects').update(changes).eq('id', id);
    if (error) throw error;
    return this.findById(id);
  }

  private mapProject(project: ProjectOverviewRow): ProjectSummary {
    return {
      id: project.id,
      name: project.name,
      baseUrl: project.base_url,
      description: project.description ?? null,
      suites: Number(project.suites ?? 0),
      cases: Number(project.cases ?? 0),
      passed: Number(project.passed ?? 0),
      failed: Number(project.failed ?? 0),
      passRate: Number(project.pass_rate ?? 0),
      lastRun: project.last_run ?? null,
      lastRunBy: project.last_run_by ?? null,
    };
  }

  private mapSuite(suite: SuiteOverviewRow): SuiteSummary {
    return {
      id: suite.id,
      name: suite.name,
      cases: Number(suite.cases ?? 0),
      passed: Number(suite.passed ?? 0),
      failed: Number(suite.failed ?? 0),
      notRun: Number(suite.not_run ?? 0),
      passRate: Number(suite.pass_rate ?? 0),
      lastRun: suite.last_run ?? null,
      lastRunBy: suite.last_run_by ?? null,
    };
  }
}
