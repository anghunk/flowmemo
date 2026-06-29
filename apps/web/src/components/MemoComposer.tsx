import { useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { Button } from "./ui/Button";
import { MemoEditor } from "./MemoEditor";
import type { MemoEditorHandle } from "./MemoEditor";
import { useCreateMemo } from "../hooks/useMemos";

type MemoComposerProps = {
  canUploadImages?: boolean;
};

let hasAutoFocusedComposer = false;

/**
 * 快速 memo 创建编辑器。
 */
export function MemoComposer({ canUploadImages = false }: MemoComposerProps) {
  const editorRef = useRef<MemoEditorHandle>(null);
  const shouldAutoFocus = !hasAutoFocusedComposer;
  const createMemo = useCreateMemo();

  useEffect(() => {
    if (shouldAutoFocus) {
      hasAutoFocusedComposer = true;
    }
  }, [shouldAutoFocus]);

  /**
   * 保存当前输入内容。
   */
  function submit() {
    const text = editorRef.current?.getMarkdownContent().trim() ?? "";
    if (!text) {
      return;
    }

    createMemo.mutate(text, {
      onSuccess: () => {
        editorRef.current?.clear();
      }
    });
  }

  return (
    <MemoEditor
      ref={editorRef}
      canUploadImages={canUploadImages}
      autoFocus={shouldAutoFocus}
      onSubmit={submit}
      footerActions={({ canSubmit }) => (
        <Button type="button" size="sm" onClick={submit} disabled={!canSubmit || createMemo.isPending}>
          <Send size={15} />
          {createMemo.isPending ? "保存中" : "保存"}
        </Button>
      )}
    />
  );
}
