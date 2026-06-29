import DOMPurify from "dompurify";
import { marked } from "marked";

marked.use({
  gfm: true,
  breaks: true
});

const TAG_PATTERN = /(^|\s)#([\p{L}\p{N}_-]{1,40})/gu;
const TAG_SKIP_SELECTORS = "a, code, pre, button";

/**
 * 为渲染后的链接补充安全打开方式。
 */
function enhanceLinks(root: HTMLElement) {
  root.querySelectorAll("a[href]").forEach((link) => {
    const anchor = link as HTMLAnchorElement;
    let url: URL;

    try {
      url = new URL(anchor.getAttribute("href") ?? "", window.location.href);
    } catch {
      return;
    }

    if (url.protocol === "http:" || url.protocol === "https:") {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
  });
}

/**
 * 将文本节点中的标签替换为可点击按钮。
 */
function highlightTags(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.parentElement?.closest(TAG_SKIP_SELECTORS) && TAG_PATTERN.test(node.data)) {
      textNodes.push(node);
    }
    TAG_PATTERN.lastIndex = 0;
  }

  textNodes.forEach((node) => {
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    for (const match of node.data.matchAll(TAG_PATTERN)) {
      const prefix = match[1] ?? "";
      const tagName = match[2];
      const startIndex = match.index ?? 0;

      fragment.append(document.createTextNode(node.data.slice(lastIndex, startIndex)));
      if (prefix) {
        fragment.append(document.createTextNode(prefix));
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "memo-tag-button";
      button.dataset.memoTag = tagName;
      button.textContent = `#${tagName}`;
      fragment.append(button);

      lastIndex = startIndex + prefix.length + tagName.length + 1;
    }

    fragment.append(document.createTextNode(node.data.slice(lastIndex)));
    node.replaceWith(fragment);
  });
}

/**
 * 将 Markdown 转成经过清理的 HTML。
 */
export function renderMarkdown(content: string): string {
  const html = marked.parse(content, { async: false });
  const sanitizedHtml = DOMPurify.sanitize(html);
  const container = document.createElement("div");
  container.innerHTML = sanitizedHtml;
  enhanceLinks(container);
  highlightTags(container);
  return container.innerHTML;
}
