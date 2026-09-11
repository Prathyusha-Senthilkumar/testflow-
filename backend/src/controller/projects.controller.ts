import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateProjectDto } from '../dto/project/create-project.dto';
import { UpdateProjectDto } from '../dto/project/update-project.dto';
import { ProjectsService } from '../service/projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list() {
    return this.projects.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.projects.get(id);
  }

  @Post()
  create(@Body() input: CreateProjectDto) {
    return this.projects.create(input);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() input: UpdateProjectDto) {
    return this.projects.update(id, input);
  }
}
