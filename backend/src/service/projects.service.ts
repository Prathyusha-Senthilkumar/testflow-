import { CreateProjectDto } from '../dto/project/create-project.dto';
import { UpdateProjectDto } from '../dto/project/update-project.dto';
import { ProjectDetail, ProjectSummary } from '../models/project.entity';

export abstract class ProjectsService {
  abstract list(): Promise<ProjectSummary[]>;
  abstract get(id: string): Promise<ProjectDetail>;
  abstract create(input: CreateProjectDto): Promise<ProjectDetail>;
  abstract update(id: string, input: UpdateProjectDto): Promise<ProjectDetail>;
}
