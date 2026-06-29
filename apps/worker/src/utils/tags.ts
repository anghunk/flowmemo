const TAG_PATTERN = /(^|\s)#([\p{L}\p{N}_-]{1,40})/gu;

/**
 * 从 Markdown/纯文本内容中提取标签。
 */
export function extractTags(content: string): string[] {
  const tags = new Map<string, string>();
  for (const match of content.matchAll(TAG_PATTERN)) {
    const name = match[2].trim();
    const normalizedName = normalizeTag(name);
    if (normalizedName) {
      tags.set(normalizedName, name);
    }
  }
  return [...tags.values()];
}

/**
 * 归一化标签名，避免大小写导致重复标签。
 */
export function normalizeTag(name: string): string {
  return name.trim().toLocaleLowerCase();
}
