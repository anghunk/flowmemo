import type { Tag } from "@flowmemo/shared";
import type { ClipboardEvent, FocusEvent, KeyboardEvent, MouseEvent } from "react";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";

export type RichEditorSelectionRange = {
  start: number;
  end: number;
};

export type MemoRichEditorHandle = {
  focus: () => void;
  getSelectionRange: () => RichEditorSelectionRange;
  setSelectionRange: (start: number, end?: number) => void;
};

type MemoRichEditorProps = {
  value: string;
  tags?: Tag[];
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  onFocus?: (event: FocusEvent<HTMLDivElement>) => void;
  onBlur?: (event: FocusEvent<HTMLDivElement>) => void;
};

type ActiveTagQuery = {
  start: number;
  end: number;
  cursor: number;
  query: string;
  top: number;
  left: number;
};

type HighlightLike = {
  add: (range: Range) => void;
};

type HighlightRegistryLike = {
  delete: (name: string) => void;
  set: (name: string, highlight: HighlightLike) => void;
};

const TAG_TOKEN_PATTERN = /(^|\s)(#[\p{L}\p{N}_-]{1,40})/gu;

/**
 * contenteditable 纯文本编辑器，额外样式通过 CSS Highlight 附加，避免 React 与浏览器同时改 DOM。
 */
export const MemoRichEditor = forwardRef<MemoRichEditorHandle, MemoRichEditorProps>(function MemoRichEditor(
  {
    value,
    tags = [],
    className,
    placeholder,
    ariaLabel = "memo 输入框",
    autoFocus = false,
    onChange,
    onKeyDown,
    onFocus,
    onBlur
  },
  ref
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const lastSelectionRef = useRef<RichEditorSelectionRange>({ start: 0, end: 0 });
  const isComposingRef = useRef(false);
  const didAutoFocusRef = useRef(false);
  const highlightNameRef = useRef(`memo-rich-editor-tag-${Math.random().toString(36).slice(2)}`);
  const [activeTagQuery, setActiveTagQuery] = useState<ActiveTagQuery | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const tagSuggestions = useMemo(() => {
    if (!activeTagQuery) {
      return [];
    }

    const keyword = activeTagQuery.query.trim().toLocaleLowerCase();
    const matchedTags = tags
      .filter((tag) => !keyword || tag.name.toLocaleLowerCase().includes(keyword))
      .slice(0, 6)
      .map((tag) => ({ id: tag.id, name: tag.name, isNew: false }));

    const hasExactMatch = tags.some((tag) => tag.name.toLocaleLowerCase() === keyword);
    if (keyword && !hasExactMatch) {
      return [
        ...matchedTags,
        {
          id: `new-${activeTagQuery.query}`,
          name: activeTagQuery.query,
          isNew: true
        }
      ].slice(0, 7);
    }

    return matchedTags;
  }, [activeTagQuery, tags]);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        editorRef.current?.focus();
      },
      getSelectionRange() {
        return getSelectionRange();
      },
      setSelectionRange(start: number, end = start) {
        lastSelectionRef.current = { start, end };
        restoreEditorSelection(start, end);
      }
    }),
    [value]
  );

  useEffect(() => {
    const styleElement = document.createElement("style");
    styleElement.textContent = `::highlight(${highlightNameRef.current}) { background: #edf7ff; color: #2563eb; }`;
    document.head.append(styleElement);

    return () => {
      getHighlightRegistry()?.delete(highlightNameRef.current);
      styleElement.remove();
    };
  }, []);

  useEffect(() => {
    if (!autoFocus || didAutoFocusRef.current) {
      return;
    }
    didAutoFocusRef.current = true;
    const frameId = window.requestAnimationFrame(() => {
      editorRef.current?.focus();
      restoreEditorSelection(value.length);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [autoFocus, value.length]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const hasPlainTextDom = !value || (editor.childNodes.length === 1 && editor.firstChild?.nodeType === Node.TEXT_NODE);
    if ((editor.textContent ?? "") !== value || !hasPlainTextDom) {
      editor.textContent = value;
    }

    applyTagHighlights();

    if (document.activeElement === editor) {
      restoreEditorSelection(lastSelectionRef.current.start, lastSelectionRef.current.end);
      updateActiveTagQuery();
    }
  }, [value]);

  useEffect(() => {
    if (!activeTagQuery) {
      return;
    }
    setActiveSuggestionIndex((current) => Math.min(current, Math.max(tagSuggestions.length - 1, 0)));
  }, [activeTagQuery, tagSuggestions.length]);

  /**
   * 读取浏览器 CSS Highlight 注册表；不支持时自动退化为普通文本。
   */
  function getHighlightRegistry(): HighlightRegistryLike | null {
    const cssWithHighlights = CSS as unknown as { highlights?: HighlightRegistryLike };
    return cssWithHighlights.highlights ?? null;
  }

  /**
   * 给纯文本里的 #标签 附加样式，不向 contenteditable 插入任何额外 DOM。
   */
  function applyTagHighlights() {
    const registry = getHighlightRegistry();
    const HighlightClass = (window as unknown as { Highlight?: new () => HighlightLike }).Highlight;
    const textNode = editorRef.current?.firstChild;
    const highlightName = highlightNameRef.current;

    registry?.delete(highlightName);
    if (!registry || !HighlightClass || !textNode || textNode.nodeType !== Node.TEXT_NODE || !value) {
      return;
    }

    const highlight = new HighlightClass();
    for (const match of value.matchAll(TAG_TOKEN_PATTERN)) {
      const matchStart = match.index ?? 0;
      const leadingText = match[1] ?? "";
      const tagText = match[2] ?? "";
      const tagStart = matchStart + leadingText.length;
      const tagEnd = tagStart + tagText.length;
      const range = document.createRange();
      range.setStart(textNode, tagStart);
      range.setEnd(textNode, tagEnd);
      highlight.add(range);
    }

    registry.set(highlightName, highlight);
  }

  /**
   * 在指定纯文本 offset 上恢复 contenteditable 光标。
   */
  function restoreEditorSelection(selectionStart: number, selectionEnd = selectionStart) {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const startPosition = getTextPosition(editor, selectionStart);
    const endPosition = getTextPosition(editor, selectionEnd);
    const range = document.createRange();
    range.setStart(startPosition.node, startPosition.offset);
    range.setEnd(endPosition.node, endPosition.offset);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  /**
   * 把纯文本 offset 映射回 DOM 文本节点位置。
   */
  function getTextPosition(root: HTMLElement, textOffset: number): { node: Node; offset: number } {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remainingOffset = Math.max(0, textOffset);
    let lastTextNode: Text | null = null;

    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      const textLength = textNode.textContent?.length ?? 0;
      if (remainingOffset <= textLength) {
        return { node: textNode, offset: remainingOffset };
      }
      remainingOffset -= textLength;
      lastTextNode = textNode;
    }

    if (lastTextNode) {
      return { node: lastTextNode, offset: lastTextNode.textContent?.length ?? 0 };
    }

    return { node: root, offset: 0 };
  }

  /**
   * 获取纯文本 offset 对应的浏览器坐标，用来贴近光标展示标签浮窗。
   */
  function getCaretRect(textOffset: number): DOMRect | null {
    const editor = editorRef.current;
    if (!editor) {
      return null;
    }

    const position = getTextPosition(editor, textOffset);
    const range = document.createRange();
    range.setStart(position.node, position.offset);
    range.setEnd(position.node, position.offset);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return rect;
    }

    if (position.node.nodeType === Node.TEXT_NODE && position.offset > 0) {
      range.setStart(position.node, position.offset - 1);
      range.setEnd(position.node, position.offset);
      return range.getBoundingClientRect();
    }

    return editor.getBoundingClientRect();
  }

  /**
   * 计算 DOM 选择点对应的纯文本 offset。
   */
  function getTextOffset(root: HTMLElement, node: Node, offset: number): number {
    const range = document.createRange();
    range.setStart(root, 0);

    try {
      range.setEnd(node, offset);
    } catch {
      return value.length;
    }

    return range.toString().length;
  }

  /**
   * 获取当前文本选择范围。
   */
  function getSelectionRange() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.anchorNode || !selection.focusNode) {
      return lastSelectionRef.current;
    }

    if (!editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) {
      return lastSelectionRef.current;
    }

    const anchorOffset = getTextOffset(editor, selection.anchorNode, selection.anchorOffset);
    const focusOffset = getTextOffset(editor, selection.focusNode, selection.focusOffset);
    return {
      start: Math.min(anchorOffset, focusOffset),
      end: Math.max(anchorOffset, focusOffset)
    };
  }

  /**
   * 记录当前编辑器光标位置，供弹出面板点击后继续插入。
   */
  function rememberSelection() {
    const editor = editorRef.current;
    if (!editor) {
      lastSelectionRef.current = { start: value.length, end: value.length };
      setActiveTagQuery(null);
      return;
    }
    lastSelectionRef.current = getSelectionRange();
    updateActiveTagQuery();
  }

  /**
   * 找到当前光标所在的 #标签片段。
   */
  function findTagQueryAtCursor(cursor: number): Omit<ActiveTagQuery, "top" | "left"> | null {
    for (const match of value.matchAll(TAG_TOKEN_PATTERN)) {
      const matchStart = match.index ?? 0;
      const leadingText = match[1] ?? "";
      const tagText = match[2] ?? "";
      const tagStart = matchStart + leadingText.length;
      const tagEnd = tagStart + tagText.length;
      if (cursor >= tagStart + 1 && cursor <= tagEnd) {
        return {
          start: tagStart,
          end: tagEnd,
          cursor,
          query: value.slice(tagStart + 1, cursor)
        };
      }
    }

    const beforeCursor = value.slice(0, cursor);
    const match = /(^|\s)#([\p{L}\p{N}_-]{0,40})$/u.exec(beforeCursor);
    if (!match) {
      return null;
    }

    const leadingText = match[1] ?? "";
    const query = match[2] ?? "";
    const tagStart = cursor - query.length - 1;
    if (leadingText && beforeCursor[tagStart - 1] && !/\s/u.test(beforeCursor[tagStart - 1])) {
      return null;
    }

    return {
      start: tagStart,
      end: cursor,
      cursor,
      query
    };
  }

  /**
   * 根据当前光标更新标签候选浮窗。
   */
  function updateActiveTagQuery() {
    const editor = editorRef.current;
    const shell = shellRef.current;
    const selection = getSelectionRange();
    if (!editor || !shell || selection.start !== selection.end || document.activeElement !== editor) {
      setActiveTagQuery(null);
      return;
    }

    const query = findTagQueryAtCursor(selection.start);
    const caretRect = query ? getCaretRect(selection.start) : null;
    if (!query || !caretRect) {
      setActiveTagQuery(null);
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    setActiveTagQuery({
      ...query,
      top: caretRect.bottom - shellRect.top + 8,
      left: Math.max(8, Math.min(caretRect.left - shellRect.left, shellRect.width - 240))
    });
  }

  /**
   * 替换当前选区文本，并恢复到替换后的光标位置。
   */
  function replaceSelection(text: string) {
    const { start, end } = getSelectionRange();
    const nextValue = `${value.slice(0, start)}${text}${value.slice(end)}`;
    const nextCursor = start + text.length;
    lastSelectionRef.current = { start: nextCursor, end: nextCursor };
    onChange(nextValue);
  }

  /**
   * 用候选标签替换当前 #标签片段。
   */
  function applyTagSuggestion(tagName: string) {
    if (!activeTagQuery) {
      return;
    }

    const afterTag = value.slice(activeTagQuery.end);
    const shouldAppendSpace = afterTag.length === 0 || !/^\s/u.test(afterTag);
    const replacement = `#${tagName}${shouldAppendSpace ? " " : ""}`;
    const nextValue = `${value.slice(0, activeTagQuery.start)}${replacement}${afterTag}`;
    const nextCursor = activeTagQuery.start + replacement.length;
    lastSelectionRef.current = { start: nextCursor, end: nextCursor };
    setActiveTagQuery(null);
    onChange(nextValue);
    window.requestAnimationFrame(() => {
      editorRef.current?.focus();
      restoreEditorSelection(nextCursor);
    });
  }

  /**
   * 从 contenteditable DOM 同步当前纯文本值。
   */
  function syncContentFromEditor(event?: { currentTarget: HTMLDivElement }) {
    if (isComposingRef.current) {
      return;
    }

    const editor = event?.currentTarget ?? editorRef.current;
    if (!editor) {
      return;
    }

    const nextValue = editor.textContent ?? "";
    lastSelectionRef.current = getSelectionRange();
    onChange(nextValue);
    window.requestAnimationFrame(updateActiveTagQuery);
  }

  /**
   * 粘贴时只接收纯文本，避免外部富文本污染编辑器 DOM。
   */
  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    replaceSelection(event.clipboardData.getData("text/plain"));
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (activeTagQuery && tagSuggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveSuggestionIndex((current) => (current + 1) % tagSuggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveSuggestionIndex((current) => (current - 1 + tagSuggestions.length) % tagSuggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        applyTagSuggestion(tagSuggestions[activeSuggestionIndex]?.name ?? tagSuggestions[0].name);
        return;
      }
    }

    if (activeTagQuery && event.key === "Escape") {
      event.preventDefault();
      setActiveTagQuery(null);
      return;
    }

    onKeyDown?.(event);
    if (event.defaultPrevented) {
      return;
    }

    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      replaceSelection("\n");
    }
  }

  function handleSuggestionMouseDown(event: MouseEvent<HTMLButtonElement>, tagName: string) {
    event.preventDefault();
    applyTagSuggestion(tagName);
  }

  /**
   * 渲染候选标签名；仅把当前输入命中的部分高亮。
   */
  function renderSuggestionName(name: string) {
    const keyword = activeTagQuery?.query.trim() ?? "";
    if (!keyword) {
      return name;
    }

    const matchIndex = name.toLocaleLowerCase().indexOf(keyword.toLocaleLowerCase());
    if (matchIndex === -1) {
      return name;
    }

    const matchEnd = matchIndex + keyword.length;
    return (
      <>
        {name.slice(0, matchIndex)}
        <span className="memo-tag-suggest-match">{name.slice(matchIndex, matchEnd)}</span>
        {name.slice(matchEnd)}
      </>
    );
  }

  return (
    <div ref={shellRef} className="memo-rich-editor-shell">
      <div
        ref={editorRef}
        className={className}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        aria-controls={activeTagQuery ? `${highlightNameRef.current}-menu` : undefined}
        aria-expanded={activeTagQuery ? "true" : undefined}
        data-placeholder={placeholder}
        onKeyDown={handleEditorKeyDown}
        onInput={syncContentFromEditor}
        onPaste={handlePaste}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          isComposingRef.current = false;
          syncContentFromEditor(event);
        }}
        onSelect={rememberSelection}
        onClick={rememberSelection}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onFocus={(event) => {
          onFocus?.(event);
          rememberSelection();
        }}
        onBlur={(event) => {
          setActiveTagQuery(null);
          onBlur?.(event);
        }}
      />
      {activeTagQuery && (
        <div
          id={`${highlightNameRef.current}-menu`}
          className="memo-tag-suggest"
          role="listbox"
          style={{ left: activeTagQuery.left, top: activeTagQuery.top }}
        >
          {tagSuggestions.length > 0 ? (
            tagSuggestions.map((tag, index) => (
              <button
                key={tag.id}
                type="button"
                className="memo-tag-suggest-item"
                role="option"
                aria-selected={index === activeSuggestionIndex}
                data-active={index === activeSuggestionIndex ? "true" : undefined}
                onMouseEnter={() => setActiveSuggestionIndex(index)}
                onMouseDown={(event) => handleSuggestionMouseDown(event, tag.name)}
              >
                <span className="memo-tag-suggest-main">
                  <span className="memo-tag-suggest-name">{renderSuggestionName(tag.name)}</span>
                  {tag.isNew && <span className="memo-tag-suggest-meta">新建</span>}
                </span>
              </button>
            ))
          ) : (
            <div className="memo-tag-suggest-empty">输入标签名称</div>
          )}
        </div>
      )}
    </div>
  );
});
