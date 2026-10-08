"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@/lib/navigation";
import { createDraftTestCase, draftEditHref } from "@/lib/createDraftTestCase";

/**
 * "Create test case" without a form: creates a draft immediately and opens it
 * in inline edit mode. `creating` drives the button's loading state.
 */
export function useCreateDraftTestCase() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const create = useCallback(
    async (projectId: string, options: { suiteId?: string | null; from?: string | null } = {}) => {
      if (!projectId || creating) return;
      setCreating(true);
      try {
        const id = await createDraftTestCase(projectId, options.suiteId);
        navigate(draftEditHref(projectId, id, options.from));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn’t create a test case");
        setCreating(false);
      }
    },
    [creating, navigate]
  );

  return { create, creating };
}
