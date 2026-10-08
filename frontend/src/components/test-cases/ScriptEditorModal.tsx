"use client";

import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type ScriptEditorModalProps = {
  open: boolean;
  onClose: () => void;
  scriptPath: string;
  content: string;
  onContentChange: (value: string) => void;
  loading: boolean;
  saving: boolean;
  onSave: () => void;
};

/** View/edit the Playwright script for a test case. Lazy-loaded by the detail page. */
export function ScriptEditorModal({
  open,
  onClose,
  scriptPath,
  content,
  onContentChange,
  loading,
  saving,
  onSave,
}: ScriptEditorModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Test script"
      description="The automated steps for this test case."
      panelClassName="sm:max-w-4xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={onSave} loading={saving} disabled={loading}>
            Save script
          </Button>
        </>
      }
    >
      {loading ? (
        <LoadingSpinner label="Loading script…" compact />
      ) : (
        <>
          {!content.trim() ? (
            <p className="mb-3 text-[13px] text-muted-foreground">
              No script is saved for this test case yet. Use <strong className="text-foreground">Record</strong> to
              generate one from browser actions, or paste a test script below and click{" "}
              <strong className="text-foreground">Save script</strong>.
            </p>
          ) : null}
          <textarea
            aria-label="Test script"
            className="min-h-[360px] w-full resize-y rounded-md border border-border bg-elevated p-3 font-mono text-xs leading-relaxed text-foreground outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            value={content}
            onChange={(event) => onContentChange(event.target.value)}
            spellCheck={false}
          />
          {scriptPath ? <p className="mt-2 font-mono text-xs text-muted-foreground">File: {scriptPath}</p> : null}
        </>
      )}
    </Modal>
  );
}

export default ScriptEditorModal;
