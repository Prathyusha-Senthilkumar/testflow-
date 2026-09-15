import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateProjectDto } from '../dto/project/create-project.dto';
import { UpdateProjectDto } from '../dto/project/update-project.dto';
import { ProjectDetail, ProjectSummary } from '../models/project.entity';
import { ProjectRepository } from '../repo/project.repository';
import { ProjectsService } from '../service/projects.service';

@Injectable()
export class ProjectsServiceImpl implements ProjectsService {
  constructor(private readonly repository: ProjectRepository) {}

  list(): Promise<ProjectSummary[]> {
    return this.repository.findAll();
  }

  get(id: string): Promise<ProjectDetail> {
    return this.repository.findById(id);
  }

  create(input: CreateProjectDto): Promise<ProjectDetail> {
    const normalized = this.validateAndNormalize(input);
    return this.repository.create(normalized);
  }

  update(id: string, input: UpdateProjectDto): Promise<ProjectDetail> {
    const normalized: UpdateProjectDto = { ...input };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('Project name is required');
      normalized.name = name;
    }
    if (input.baseUrl !== undefined) normalized.baseUrl = this.normalizeUrl(input.baseUrl);
    if (input.description !== undefined) normalized.description = input.description?.trim() || null;
    return this.repository.update(id, normalized);
  }

  private validateAndNormalize(input: CreateProjectDto): CreateProjectDto {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Project name is required');
    return {
      name,
      baseUrl: this.normalizeUrl(input.baseUrl),
      description: input.description?.trim() || undefined,
    };
  }

  private normalizeUrl(value: string): string {
    const raw = value?.trim();
    if (!raw) throw new BadRequestException('Application URL is required');
    try {
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
      return url.toString();
    } catch {
      throw new BadRequestException('Enter a valid http:// or https:// URL');
    }
  }
}
