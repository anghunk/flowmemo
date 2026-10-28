import type {
  ChangePasswordRequest, CreateApiTokenRequest, CreateMemoRequest, LoginRequest, MemoListQuery,
  RegisterRequest, UpdateInviteRegistrationRequest, UpdateMemoRequest, UpdatePreferencesRequest,
  UpdateProfileRequest, UpdateTagRequest, UpdateUserMembershipRequest
} from "@flowmemo/shared";
import {
  countMemoImages,
  MEMO_IMAGE_MAX_COUNT,
  MEMO_MAX_LENGTH,
  REGISTER_ACCOUNT_MAX_LENGTH
} from "@flowmemo/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types";
import type { RequestSchema } from "../utils/validation";
import {
  booleanField, dateField, enumField, nullableField, optionalField, readIntegerQuery,
  stringArrayField, stringField, timestampField, ValidationError
} from "../utils/validation";

/** 统一校验笔记正文的文字长度与 Markdown 图片数量。 */
function memoContent(value: unknown): string {
  const content = stringField("内容", { min: 1, max: MEMO_MAX_LENGTH })(value);
  if (countMemoImages(content) > MEMO_IMAGE_MAX_COUNT) {
    throw new ValidationError(`同一条笔记最多支持 ${MEMO_IMAGE_MAX_COUNT} 张图片`);
  }
  return content;
}

const account = stringField("账号", { min: 1, max: REGISTER_ACCOUNT_MAX_LENGTH });
const password = stringField("密码", { min: 8, max: 128, trim: false });

export const registerSchema: RequestSchema<RegisterRequest> = {
  account, password, inviteCode: optionalField(stringField("邀请码", { max: 32 }))
};
export const loginSchema: RequestSchema<LoginRequest> = {
  account, password: stringField("密码", { min: 1, max: 128, trim: false })
};
export const profileSchema: RequestSchema<UpdateProfileRequest> = {
  nickname: stringField("昵称", { max: 32 })
};
export const passwordSchema: RequestSchema<ChangePasswordRequest> = {
  oldPassword: stringField("原密码", { min: 1, max: 128, trim: false }), newPassword: password
};
export const createMemoSchema: RequestSchema<CreateMemoRequest> = { content: memoContent };
export const updateMemoSchema: RequestSchema<UpdateMemoRequest> = {
  content: optionalField(memoContent),
  pinned: optionalField(booleanField("置顶状态")),
  archived: optionalField(booleanField("归档状态"))
};
export const apiTokenSchema: RequestSchema<CreateApiTokenRequest> = {
  name: optionalField(stringField("API Token 名称", { max: 64 })),
  scope: optionalField(enumField("可读范围", ["all", "tags"])),
  tags: optionalField(stringArrayField("可读标签", 50, 40))
};
export const membershipSchema: RequestSchema<UpdateUserMembershipRequest> = {
  plan: enumField("会员状态", ["free", "member"]),
  membershipExpiresAt: optionalField(nullableField(timestampField("会员到期时间")))
};
export const inviteSettingsSchema: RequestSchema<UpdateInviteRegistrationRequest> = {
  registrationEnabled: booleanField("邀请码模式开关")
};
export const preferencesSchema: RequestSchema<UpdatePreferencesRequest> = {
  theme: optionalField(enumField("主题", ["system", "light", "dark"])),
  density: optionalField(enumField("显示密度", ["comfortable", "compact"])),
  defaultView: optionalField(enumField("默认视图", ["all", "pinned", "archive"]))
};
export const tagSchema: RequestSchema<UpdateTagRequest> = {
  icon(value) {
    if (value === null) {
      return null;
    }
    const icon = stringField("标签图标", { max: 32 })(value);
    if (!icon) {
      return null;
    }
    if (/[\u0000-\u001F\u007F-\u009F\s]/u.test(icon) || !(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(icon) || /^[0-9#*]\uFE0F?\u20E3$/u.test(icon))) {
      throw new ValidationError("标签图标必须是有效的 emoji");
    }
    return icon;
  }
};

/** 统一解析列表查询，同时兼容已有的标签和分页参数别名。 */
export function readMemoListQuery(c: Context<AppEnv>): MemoListQuery {
  const url = new URL(c.req.url);
  const tags = [...url.searchParams.getAll("tags"), ...url.searchParams.getAll("labels")]
    .flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  const view = c.req.query("view");
  const tag = c.req.query("tag") ?? c.req.query("label");
  const date = c.req.query("date");
  const pageSizeName = c.req.query("pageSize") !== undefined ? "pageSize" : "page_size";
  return {
    view: view === undefined ? undefined : enumField("视图", ["all", "pinned", "archive"])(view),
    tag: tag === undefined ? undefined : stringField("标签", { min: 1, max: 40 })(tag),
    tags: tags.length ? stringArrayField("标签", 50, 40)(tags) : undefined,
    q: optionalField(stringField("搜索关键词", { max: MEMO_MAX_LENGTH }))(c.req.query("q")),
    date: date === undefined ? undefined : dateField(date),
    cursor: optionalField(stringField("分页游标", { min: 1, max: 1000 }))(c.req.query("cursor")),
    limit: readIntegerQuery(c, "limit", 1, 50),
    page: readIntegerQuery(c, "page", 1, 1000000),
    pageSize: readIntegerQuery(c, pageSizeName, 1, 50)
  };
}

/** 读取热力图日期范围与分钟时区偏移。 */
export function readCalendarQuery(c: Context<AppEnv>) {
  const from = timestampField("开始时间")(c.req.query("from"));
  const to = timestampField("结束时间")(c.req.query("to"));
  if (from >= to) {
    throw new ValidationError("结束时间必须晚于开始时间");
  }
  return { from, to, utcOffsetMinutes: readIntegerQuery(c, "utcOffsetMinutes", -840, 840) ?? 0 };
}

/** 后台搜索与游标使用相同的字符串和时间校验规则。 */
export function readAdminUserQuery(c: Context<AppEnv>) {
  return {
    q: optionalField(stringField("搜索关键词", { max: REGISTER_ACCOUNT_MAX_LENGTH }))(c.req.query("q")),
    cursor: optionalField(timestampField("分页游标"))(c.req.query("cursor")),
    limit: readIntegerQuery(c, "limit", 1, 50) ?? 30
  };
}
