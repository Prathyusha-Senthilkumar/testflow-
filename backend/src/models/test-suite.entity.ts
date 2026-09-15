export type SuiteSource = 'Manual' | 'Suggested';

export interface TestSuiteEntity {
  id: string;
  projectId: string;
  name: string;
  source: SuiteSource;
}
