import { Controller, Get } from '@nestjs/common';
import { DashboardService } from '../service/dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get() {
    return this.dashboard.getOverview();
  }
}
