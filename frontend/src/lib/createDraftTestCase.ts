import { api, type TestCaseInput } from "./api";

export const DRAFT_TEST_NAME = "Untitled test";

/** Payload for a new draft test case: a placeholder name the user renames inline. */
export function draftTestCaseInput(suiteId?: string | null): TestCaseInput {
  return {
    name: DRAFT_TEST_NAME,
    description: "",
    category: "Functional",
    scenario: "Happy Path",
    categories: [],
    environmentIds: [],
    ...(suiteId ? { suiteId } : {}),
  };
}

/** Creates a draft test case and returns its id. */
export async function createDraftTestCase(projectId: string, suiteId?: string | null): Promise<string> {
  const created = await api.createTestCase(projectId, draftTestCaseInput(suiteId));
  return created.id;
}

/** Detail route of a just-created draft, opened in inline edit mode. */
export function draftEditHref(projectId: string, testCaseId: string, from?: string | null): string {
  const params = new URLSearchParams({ edit: "1", new: "1" });
  if (from && from.startsWith("/") && !from.startsWith("//")) params.set("from", from);
  return `/projects/${projectId}/test-cases/${testCaseId}?${params.toString()}`;
}
