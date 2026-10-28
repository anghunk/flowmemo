import type { Context } from "hono";
import type { AppEnv } from "../types";

/** 可直接展示给调用方的请求参数错误。 */
export class ValidationError extends Error {
  /** 保存中文错误信息，由入口统一映射为 HTTP 400。 */
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** 从不可信输入中读取一个字段。 */
type FieldParser<T> = (value: unknown) => T;
/** 与共享请求类型逐字段对应的运行时校验规则。 */
export type RequestSchema<T> = { [K in keyof T]-?: FieldParser<T[K]> };

/** 验证 JSON 对象并只读取声明过的字段，不信任泛型断言。 */
export async function readJson<T>(c: Context<AppEnv>, schema: RequestSchema<T>): Promise<T> {
  if (!/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/iu.test(c.req.header("Content-Type") ?? "")) {
    throw new ValidationError("请使用 application/json 请求体");
  }
  let value: unknown;
  try {
    value = await c.req.json<unknown>();
  } catch {
    throw new ValidationError("请求体必须是有效的 JSON 对象");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("请求体必须是 JSON 对象");
  }
  const input = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(schema) as (keyof T & string)[]) {
    result[key] = schema[key](input[key]);
  }
  return result as T;
}

/** 读取字符串，按字段用途选择是否去空格并限制长度。 */
export function stringField(label: string, options: { min?: number; max?: number; trim?: boolean; } = {}): FieldParser<string> {
  return (value) => {
    if (typeof value !== "string") {
      throw new ValidationError(`${label}必须是字符串`);
    }
    const text = options.trim === false ? value : value.trim();
    if (options.min !== undefined && text.length < options.min) {
      throw new ValidationError(`${label}至少需要 ${options.min} 个字符`);
    }
    if (options.max !== undefined && text.length > options.max) {
      throw new ValidationError(`${label}不能超过 ${options.max} 个字符`);
    }
    return text;
  };
}

/** 读取布尔值，拒绝字符串和数字的隐式转换。 */
export function booleanField(label: string): FieldParser<boolean> {
  return (value) => {
    if (typeof value !== "boolean") {
      throw new ValidationError(`${label}必须是布尔值`);
    }
    return value;
  };
}

/** 读取有限枚举中的一个值。 */
export function enumField<const T extends string>(label: string, values: readonly T[]): FieldParser<T> {
  return (value) => {
    if (typeof value !== "string" || !values.includes(value as T)) {
      throw new ValidationError(`${label}无效`);
    }
    return value as T;
  };
}

/** 允许省略字段；显式 null 仍由内部规则判断。 */
export function optionalField<T>(parser: FieldParser<T>): FieldParser<T | undefined> {
  return (value) => value === undefined ? undefined : parser(value);
}

/** 允许使用 null 清空字段。 */
export function nullableField<T>(parser: FieldParser<T>): FieldParser<T | null> {
  return (value) => value === null ? null : parser(value);
}

/** 读取字符串数组，并限制输入规模。 */
export function stringArrayField(label: string, maxCount: number, maxLength: number): FieldParser<string[]> {
  return (value) => {
    if (!Array.isArray(value) || value.length > maxCount) {
      throw new ValidationError(`${label}必须是最多 ${maxCount} 项的数组`);
    }
    return value.map(stringField(label, { min: 1, max: maxLength }));
  };
}

/** 读取带时区的 ISO 时间并标准化，避免数据库中混用时间格式。 */
export function timestampField(label: string): FieldParser<string> {
  return (value) => {
    const text = stringField(label, { max: 40 })(value);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/u.test(text) || !Number.isFinite(Date.parse(text))) {
      throw new ValidationError(`${label}必须是带时区的有效 ISO 时间`);
    }
    dateField(text.slice(0, 10));
    return new Date(text).toISOString();
  };
}

/** 读取可选的整数查询参数，非法数字统一返回 400。 */
export function readIntegerQuery(c: Context<AppEnv>, name: string, min: number, max: number): number | undefined {
  const value = c.req.query(name);
  if (value === undefined) {
    return undefined;
  }
  const number = Number(value);
  if (!value.trim() || !Number.isSafeInteger(number) || number < min || number > max) {
    throw new ValidationError(`${name}必须是 ${min} 到 ${max} 之间的整数`);
  }
  return number;
}

/** 校验实际存在的 YYYY-MM-DD 日期。 */
export function dateField(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new ValidationError("日期必须是有效的 YYYY-MM-DD 格式");
  }
  return value;
}
