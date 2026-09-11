import { DashboardData } from '../models/dashboard.entity';

export abstract class DashboardService {
  abstract getOverview(): Promise<DashboardData>;
}
