const PASSWORD_ITERATIONS = 100000;

/**
 * 将 ArrayBuffer 转成 URL 安全的 base64 字符串。
 */
export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/**
 * 将 URL 安全的 base64 字符串转回 ArrayBuffer。
 */
export function base64UrlToBuffer(value: string): ArrayBuffer {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const base64 = padded.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

/**
 * 生成随机 token。
 */
export function createToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bufferToBase64Url(bytes.buffer);
}

/**
 * 计算 SHA-256 摘要，用于避免在 KV 中直接保存原始 session token。
 */
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bufferToBase64Url(digest);
}

/**
 * 使用 PBKDF2-SHA256 生成密码哈希。
 */
export async function hashPassword(
  password: string,
  salt = createToken(16),
  iterations = PASSWORD_ITERATIONS
): Promise<{ hash: string; salt: string; iterations: number; algorithm: "PBKDF2-SHA256" }> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits"
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64UrlToBuffer(salt),
      iterations
    },
    key,
    256
  );

  return {
    hash: bufferToBase64Url(bits),
    salt,
    iterations,
    algorithm: "PBKDF2-SHA256"
  };
}

/**
 * 使用恒定时间比较两个字符串，降低时序侧信道风险。
 */
export function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const max = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < max; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

/**
 * 校验用户输入密码是否匹配存储哈希。
 */
export async function verifyPassword(params: {
  password: string;
  hash: string;
  salt: string;
  iterations: number;
}): Promise<boolean> {
  const result = await hashPassword(params.password, params.salt, params.iterations);
  return timingSafeEqual(result.hash, params.hash);
}
