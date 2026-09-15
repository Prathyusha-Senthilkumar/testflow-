export type AutomationStatus = 'Manual' | 'Automated' | 'Not Configured';

export interface TestCaseEntity {
  id: string;
  projectId: string;
  code: string;
  name: string;
  description: string | null;
  testFile: string | null;
  automationStatus: AutomationStatus;
  suggestedSuiteName?: string | null;
}
