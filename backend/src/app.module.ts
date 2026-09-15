import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseService } from './config/supabase.config';
import { DashboardController } from './controller/dashboard.controller';
import { ProjectsController } from './controller/projects.controller';
import { ProjectRepository } from './repo/project.repository';
import { DashboardService } from './service/dashboard.service';
import { ProjectsService } from './service/projects.service';
import { DashboardServiceImpl } from './serviceimpl/dashboard.service.impl';
import { ProjectsServiceImpl } from './serviceimpl/projects.service.impl';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [DashboardController, ProjectsController],
  providers: [
    SupabaseService,
    ProjectRepository,
    { provide: ProjectsService, useClass: ProjectsServiceImpl },
    { provide: DashboardService, useClass: DashboardServiceImpl },
  ],
})
export class AppModule {}
