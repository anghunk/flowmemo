import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  Archive,
  Check,
  Copy,
  Hash,
  LogOut,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Send,
  Shuffle,
  Trash2,
  X
} from "lucide-react-native";
import {
  MEMO_MAX_LENGTH,
  normalizeRegisterAccount,
  normalizeRegisterInviteCode,
  validateRegisterAccount,
  validateRegisterInviteCode
} from "@flowmemo/shared";
import type { Memo, MemoListQuery, Tag } from "@flowmemo/shared";
import { ApiError, WEB_BASE_URL, api } from "./src/lib/api";
import { useLogin, useLogout, useMe, useRegister, useUpdateProfile } from "./src/hooks/useAuth";
import {
  useClearArchivedMemos,
  useCreateMemo,
  useDeleteMemo,
  useMemos,
  usePublishedMemos,
  usePublishMemo,
  useTags,
  useUnpublishMemo,
  useUpdateMemo
} from "./src/hooks/useMemos";

type ViewMode = "all" | "pinned" | "archive" | "published" | "settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false
    }
  }
});

const viewTabs: Array<{ value: ViewMode; label: string }> = [
  { value: "all", label: "全部" },
  { value: "pinned", label: "置顶" },
  { value: "archive", label: "归档" },
  { value: "published", label: "公开" },
  { value: "settings", label: "设置" }
];

/**
 * React Native Android 应用入口。
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <FlowMemoApp />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/**
 * 根据登录态渲染认证页或 memo 工作台。
 */
function FlowMemoApp() {
  const me = useMe();

  if (me.isLoading) {
    return (
      <SafeAreaView style={styles.centerShell}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.mutedText}>正在检查登录状态</Text>
      </SafeAreaView>
    );
  }

  if (!me.data?.user) {
    return <AuthScreen />;
  }

  return <MemoWorkspace />;
}

/**
 * 登录和注册页。
 */
function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [account, setAccount] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const login = useLogin();
  const register = useRegister();
  const submitting = login.isPending || register.isPending;
  const error = getMutationError(login.error ?? register.error);

  function submit() {
    if (submitting) {
      return;
    }

    if (mode === "login") {
      login.mutate({ account, password });
      return;
    }

    const normalizedAccount = normalizeRegisterAccount(account);
    const normalizedInviteCode = normalizeRegisterInviteCode(inviteCode);
    const accountError = validateRegisterAccount(normalizedAccount);
    const inviteCodeError = validateRegisterInviteCode(normalizedInviteCode);
    if (accountError) {
      Alert.alert("无法注册", accountError);
      return;
    }
    if (inviteCodeError) {
      Alert.alert("无法注册", inviteCodeError);
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("无法注册", "两次输入的密码不一致");
      return;
    }
    register.mutate({ account: normalizedAccount, password, inviteCode: normalizedInviteCode });
  }

  return (
    <SafeAreaView style={styles.authShell}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboardShell}>
        <View style={styles.authPanel}>
          <Text style={styles.brand}>FlowMemo</Text>
          <Text style={styles.authTitle}>{mode === "login" ? "登录账号" : "创建账号"}</Text>
          <Text style={styles.authSubtitle}>随手记录，稍后再整理。</Text>

          <SegmentedControl
            value={mode}
            options={[
              { value: "login", label: "登录" },
              { value: "register", label: "注册" }
            ]}
            onChange={(next) => setMode(next as "login" | "register")}
          />

          <LabeledInput
            label={mode === "login" ? "账号" : "邮箱"}
            value={account}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            onChangeText={setAccount}
          />
          <LabeledInput
            label="密码"
            value={password}
            secureTextEntry
            autoComplete={mode === "login" ? "password" : "new-password"}
            onChangeText={setPassword}
          />
          {mode === "register" && (
            <>
              <LabeledInput
                label="邀请码（可选）"
                value={inviteCode}
                autoCapitalize="characters"
                autoComplete="one-time-code"
                onChangeText={setInviteCode}
              />
              <LabeledInput
                label="确认密码"
                value={confirmPassword}
                secureTextEntry
                autoComplete="new-password"
                onChangeText={setConfirmPassword}
              />
            </>
          )}
          {error && <ErrorBanner message={error} />}
          <PrimaryButton disabled={submitting} onPress={submit} icon={<Send size={17} color={colors.onAccent} />}>
            {submitting ? "提交中" : mode === "login" ? "登录" : "创建账号"}
          </PrimaryButton>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * 登录后的 memo 工作台。
 */
function MemoWorkspace() {
  const [view, setView] = useState<ViewMode>("all");
  const [q, setQ] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | undefined>();
  const [randomMemo, setRandomMemo] = useState<Memo | null>(null);
  const [randomLoading, setRandomLoading] = useState(false);
  const me = useMe();
  const tags = useTags();
  const published = usePublishedMemos();
  const clearArchived = useClearArchivedMemos();

  const memoQuery = useMemo<MemoListQuery>(
    () => ({
      view: view === "archive" ? "archive" : view === "pinned" ? "pinned" : "all",
      tag: selectedTag,
      q,
      limit: 50
    }),
    [q, selectedTag, view]
  );
  const memos = useMemos(memoQuery);
  const displayName = me.data?.user.nickname || me.data?.user.account || "FlowMemo";
  const listMemos =
    view === "published" ? published.data?.memos.map((item) => item.memo) ?? [] : memos.data?.memos ?? [];
  const refreshing = view === "published" ? published.isRefetching : memos.isRefetching;
  const loading = view === "published" ? published.isLoading : memos.isLoading;

  async function refresh() {
    if (view === "published") {
      await published.refetch();
      return;
    }
    await memos.refetch();
  }

  async function roamRandomMemo() {
    if (randomLoading) {
      return;
    }
    setRandomLoading(true);
    try {
      const result = await api.randomMemo();
      setRandomMemo(result.memo);
    } catch (error) {
      Alert.alert("随机漫游失败", getMutationError(error) ?? "没有可漫游的 memo");
    } finally {
      setRandomLoading(false);
    }
  }

  function clearArchive() {
    Alert.alert("清空归档", "确认永久删除归档中的所有 memo？此操作不可恢复。", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => clearArchived.mutate(undefined, {
          onSuccess: (data) => Alert.alert("已清空归档", `永久删除 ${data.deleted} 条 memo`)
        })
      }
    ]);
  }

  if (view === "settings") {
    return (
      <AppFrame displayName={displayName} view={view} selectedTag={selectedTag} onViewChange={setView}>
        <SettingsScreen account={me.data?.user.account ?? ""} nickname={me.data?.user.nickname ?? ""} />
      </AppFrame>
    );
  }

  return (
    <AppFrame displayName={displayName} view={view} selectedTag={selectedTag} onViewChange={setView}>
      <FlatList
        data={listMemos}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <SearchBox value={q} onChangeText={setQ} />
            <TagStrip
              tags={tags.data?.tags ?? []}
              selectedTag={selectedTag}
              onSelectTag={setSelectedTag}
            />
            <View style={styles.toolbarRow}>
              <SecondaryButton onPress={roamRandomMemo} icon={<Shuffle size={16} color={colors.ink} />}>
                {randomLoading ? "漫游中" : "随机漫游"}
              </SecondaryButton>
              {view === "archive" && (
                <DangerButton
                  disabled={clearArchived.isPending || listMemos.length === 0}
                  onPress={clearArchive}
                  icon={<Trash2 size={16} color={colors.danger} />}
                >
                  清空归档
                </DangerButton>
              )}
            </View>
            {randomMemo && (
              <RandomMemoPanel memo={randomMemo} onClose={() => setRandomMemo(null)} onSelectTag={setSelectedTag} />
            )}
            {view !== "archive" && view !== "published" && <MemoComposer />}
            {loading && <ActivityIndicator color={colors.accent} style={styles.inlineLoader} />}
          </View>
        }
        ListEmptyComponent={!loading ? <EmptyState view={view} /> : null}
        renderItem={({ item }) => (
          <MemoCard memo={item} archiveView={view === "archive"} onSelectTag={setSelectedTag} />
        )}
      />
    </AppFrame>
  );
}

/**
 * 应用通用顶栏和分段导航。
 */
function AppFrame({
  displayName,
  view,
  selectedTag,
  children,
  onViewChange
}: {
  displayName: string;
  view: ViewMode;
  selectedTag?: string;
  children: ReactNode;
  onViewChange: (view: ViewMode) => void;
}) {
  return (
    <SafeAreaView style={styles.appShell}>
      <View style={styles.topbar}>
        <View>
          <Text style={styles.brandSmall}>FlowMemo</Text>
          <Text style={styles.topbarTitle} numberOfLines={1}>
            {selectedTag ? `#${selectedTag}` : getViewTitle(view)}
          </Text>
        </View>
        <Text style={styles.profileName} numberOfLines={1}>
          {displayName}
        </Text>
      </View>
      <SegmentedControl value={view} options={viewTabs} onChange={(next) => onViewChange(next as ViewMode)} />
      {children}
    </SafeAreaView>
  );
}

/**
 * 快速创建 memo。
 */
function MemoComposer() {
  const [content, setContent] = useState("");
  const createMemo = useCreateMemo();
  const error = getMutationError(createMemo.error);

  function submit() {
    const text = content.trim();
    if (!text) {
      return;
    }
    if (text.length > MEMO_MAX_LENGTH) {
      Alert.alert("内容过长", `内容不能超过 ${MEMO_MAX_LENGTH} 字`);
      return;
    }
    createMemo.mutate(text, {
      onSuccess: () => setContent("")
    });
  }

  return (
    <View style={styles.composer}>
      <TextInput
        value={content}
        onChangeText={setContent}
        multiline
        maxLength={MEMO_MAX_LENGTH}
        placeholder="现在想到什么？支持 Markdown 和 #标签"
        placeholderTextColor={colors.muted}
        textAlignVertical="top"
        style={styles.composerInput}
      />
      <View style={styles.composerFooter}>
        <Text style={styles.counter}>{content.length}/{MEMO_MAX_LENGTH}</Text>
        <PrimaryButton
          disabled={!content.trim() || createMemo.isPending}
          onPress={submit}
          icon={<Plus size={17} color={colors.onAccent} />}
        >
          {createMemo.isPending ? "保存中" : "保存"}
        </PrimaryButton>
      </View>
      {error && <ErrorBanner message={error} />}
    </View>
  );
}

/**
 * 单条 memo 卡片。
 */
function MemoCard({ memo, archiveView, onSelectTag }: { memo: Memo; archiveView: boolean; onSelectTag: (tag: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(memo.content);
  const updateMemo = useUpdateMemo();
  const deleteMemo = useDeleteMemo();
  const publishMemo = usePublishMemo();
  const unpublishMemo = useUnpublishMemo();
  const mutationError = getMutationError(updateMemo.error ?? deleteMemo.error ?? publishMemo.error ?? unpublishMemo.error);

  function saveEdit() {
    const text = content.trim();
    if (!text) {
      Alert.alert("内容不能为空");
      return;
    }
    updateMemo.mutate({ id: memo.id, content: text }, { onSuccess: () => setEditing(false) });
  }

  function deleteCurrentMemo() {
    Alert.alert("永久删除", "确认永久删除这条归档 memo？", [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => deleteMemo.mutate(memo.id) }
    ]);
  }

  async function publishAndCopy() {
    publishMemo.mutate(memo.id, {
      onSuccess: async (data) => {
        await Clipboard.setStringAsync(getPublicMemoUrl(data.published.publicId));
        Alert.alert("已生成公开链接", "链接已复制到剪贴板");
      }
    });
  }

  async function copyPublicLink() {
    if (!memo.publicId) {
      return;
    }
    await Clipboard.setStringAsync(getPublicMemoUrl(memo.publicId));
    Alert.alert("已复制", "公开链接已复制到剪贴板");
  }

  return (
    <View style={[styles.memoCard, memo.pinned && !archiveView ? styles.memoCardPinned : null]}>
      <View style={styles.memoMetaRow}>
        <Text style={styles.memoTime}>{formatTime(memo.createdAt)}</Text>
        {memo.pinned && !archiveView && (
          <View style={styles.pinBadge}>
            <Pin size={12} color={colors.accent} />
            <Text style={styles.pinBadgeText}>置顶</Text>
          </View>
        )}
      </View>

      {editing ? (
        <View>
          <TextInput
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
            style={styles.editInput}
          />
          <View style={styles.actionRow}>
            <SecondaryButton onPress={() => setEditing(false)} icon={<X size={16} color={colors.ink} />}>
              取消
            </SecondaryButton>
            <PrimaryButton
              disabled={updateMemo.isPending || !content.trim()}
              onPress={saveEdit}
              icon={<Check size={16} color={colors.onAccent} />}
            >
              保存
            </PrimaryButton>
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.memoContent}>{memo.content}</Text>
          {memo.tags.length > 0 && (
            <View style={styles.memoTagRow}>
              {memo.tags.map((tag) => (
                <TagChip key={tag.id} tag={tag} selected={false} onPress={() => onSelectTag(tag.name)} />
              ))}
            </View>
          )}
          <View style={styles.actionRow}>
            {archiveView ? (
              <>
                <IconButton
                  label="恢复"
                  onPress={() => updateMemo.mutate({ id: memo.id, archived: false })}
                  icon={<RotateCcw size={16} color={colors.ink} />}
                />
                <IconButton
                  label="删除"
                  danger
                  onPress={deleteCurrentMemo}
                  icon={<Trash2 size={16} color={colors.danger} />}
                />
              </>
            ) : (
              <>
                <IconButton
                  label={memo.pinned ? "取消置顶" : "置顶"}
                  onPress={() => updateMemo.mutate({ id: memo.id, pinned: !memo.pinned })}
                  icon={memo.pinned ? <PinOff size={16} color={colors.ink} /> : <Pin size={16} color={colors.ink} />}
                />
                <IconButton label="编辑" onPress={() => setEditing(true)} icon={<Pencil size={16} color={colors.ink} />} />
                {memo.publicId ? (
                  <>
                    <IconButton label="复制链接" onPress={copyPublicLink} icon={<Copy size={16} color={colors.ink} />} />
                    <IconButton
                      label="取消公开"
                      danger
                      onPress={() => unpublishMemo.mutate(memo.id)}
                      icon={<X size={16} color={colors.danger} />}
                    />
                  </>
                ) : (
                  <IconButton label="公开" onPress={publishAndCopy} icon={<Copy size={16} color={colors.ink} />} />
                )}
                <IconButton
                  label="归档"
                  danger
                  onPress={() => updateMemo.mutate({ id: memo.id, archived: true })}
                  icon={<Archive size={16} color={colors.danger} />}
                />
              </>
            )}
          </View>
        </>
      )}
      {mutationError && <ErrorBanner message={mutationError} />}
    </View>
  );
}

/**
 * 随机漫游展示区。
 */
function RandomMemoPanel({ memo, onClose, onSelectTag }: { memo: Memo; onClose: () => void; onSelectTag: (tag: string) => void }) {
  return (
    <View style={styles.randomPanel}>
      <View style={styles.randomHeader}>
        <Text style={styles.randomTitle}>随机漫游</Text>
        <IconButton label="关闭" onPress={onClose} icon={<X size={15} color={colors.ink} />} />
      </View>
      <MemoCard memo={memo} archiveView={false} onSelectTag={onSelectTag} />
    </View>
  );
}

/**
 * 设置页。
 */
function SettingsScreen({ account, nickname }: { account: string; nickname: string }) {
  const [nextNickname, setNextNickname] = useState(nickname);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const updateProfile = useUpdateProfile();
  const logout = useLogout();
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const error = getMutationError(updateProfile.error ?? logout.error);

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      Alert.alert("无法更新密码", "两次输入的新密码不一致");
      return;
    }
    setPasswordSubmitting(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("已更新", "密码已更新");
    } catch (changeError) {
      Alert.alert("更新失败", getMutationError(changeError) ?? "请稍后再试");
    } finally {
      setPasswordSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.settingsContent} keyboardShouldPersistTaps="handled">
      <View style={styles.settingsSection}>
        <Text style={styles.sectionLabel}>账号</Text>
        <Text style={styles.accountText}>{account}</Text>
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.sectionLabel}>资料</Text>
        <LabeledInput label="昵称" value={nextNickname} maxLength={32} onChangeText={setNextNickname} />
        <PrimaryButton
          disabled={updateProfile.isPending}
          onPress={() => updateProfile.mutate({ nickname: nextNickname })}
          icon={<Check size={16} color={colors.onAccent} />}
        >
          {updateProfile.isPending ? "保存中" : "保存昵称"}
        </PrimaryButton>
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.sectionLabel}>安全</Text>
        <LabeledInput label="当前密码" value={oldPassword} secureTextEntry onChangeText={setOldPassword} />
        <LabeledInput label="新密码" value={newPassword} secureTextEntry onChangeText={setNewPassword} />
        <LabeledInput label="确认新密码" value={confirmPassword} secureTextEntry onChangeText={setConfirmPassword} />
        <PrimaryButton
          disabled={passwordSubmitting || !oldPassword || !newPassword || !confirmPassword}
          onPress={changePassword}
          icon={<Check size={16} color={colors.onAccent} />}
        >
          {passwordSubmitting ? "更新中" : "更新密码"}
        </PrimaryButton>
      </View>

      {error && <ErrorBanner message={error} />}
      <DangerButton onPress={() => logout.mutate()} icon={<LogOut size={16} color={colors.danger} />}>
        退出登录
      </DangerButton>
    </ScrollView>
  );
}

function SearchBox({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.searchBox}>
      <Search size={17} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="搜索 memo"
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
      />
    </View>
  );
}

function TagStrip({
  tags,
  selectedTag,
  onSelectTag
}: {
  tags: Tag[];
  selectedTag?: string;
  onSelectTag: (tag: string | undefined) => void;
}) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagStrip}>
      {selectedTag && (
        <Pressable style={styles.clearTagButton} onPress={() => onSelectTag(undefined)}>
          <X size={14} color={colors.ink} />
          <Text style={styles.clearTagText}>清除筛选</Text>
        </Pressable>
      )}
      {tags.map((tag) => (
        <TagChip key={tag.id} tag={tag} selected={selectedTag === tag.name} onPress={() => onSelectTag(tag.name)} />
      ))}
    </ScrollView>
  );
}

function TagChip({ tag, selected, onPress }: { tag: Tag; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tagChip, selected ? styles.tagChipSelected : null]} onPress={onPress}>
      {tag.icon ? <Text style={styles.tagIcon}>{tag.icon}</Text> : <Hash size={13} color={selected ? colors.onAccent : colors.muted} />}
      <Text style={[styles.tagChipText, selected ? styles.tagChipTextSelected : null]} numberOfLines={1}>
        {tag.name}
      </Text>
      <Text style={[styles.tagCount, selected ? styles.tagChipTextSelected : null]}>{tag.memoCount}</Text>
    </Pressable>
  );
}

function SegmentedControl({
  value,
  options,
  onChange
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmented}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[styles.segment, selected ? styles.segmentSelected : null]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.segmentText, selected ? styles.segmentTextSelected : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function LabeledInput({
  label,
  style,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.textInput, style]}
        {...props}
      />
    </View>
  );
}

function PrimaryButton({
  children,
  icon,
  disabled,
  onPress
}: {
  children: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.primaryButton, disabled ? styles.buttonDisabled : null]} disabled={disabled} onPress={onPress}>
      {icon}
      <Text style={styles.primaryButtonText}>{children}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  children,
  icon,
  disabled,
  onPress
}: {
  children: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.secondaryButton, disabled ? styles.buttonDisabled : null]} disabled={disabled} onPress={onPress}>
      {icon}
      <Text style={styles.secondaryButtonText}>{children}</Text>
    </Pressable>
  );
}

function DangerButton({
  children,
  icon,
  disabled,
  onPress
}: {
  children: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.dangerButton, disabled ? styles.buttonDisabled : null]} disabled={disabled} onPress={onPress}>
      {icon}
      <Text style={styles.dangerButtonText}>{children}</Text>
    </Pressable>
  );
}

function IconButton({
  label,
  icon,
  danger,
  onPress
}: {
  label: string;
  icon: ReactNode;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.iconButton, danger ? styles.iconButtonDanger : null]} onPress={onPress}>
      {icon}
      <Text style={[styles.iconButtonText, danger ? styles.iconButtonDangerText : null]}>{label}</Text>
    </Pressable>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

function EmptyState({ view }: { view: ViewMode }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{view === "archive" ? "归档是空的" : "这里还没有 memo"}</Text>
      <Text style={styles.emptySubtitle}>{view === "published" ? "公开后的 memo 会出现在这里。" : "写下一条，列表马上就会热闹起来。"}</Text>
    </View>
  );
}

function getViewTitle(view: ViewMode): string {
  if (view === "pinned") {
    return "置顶 memo";
  }
  if (view === "archive") {
    return "归档";
  }
  if (view === "published") {
    return "公开 memo";
  }
  if (view === "settings") {
    return "设置";
  }
  return "全部 memo";
}

function getPublicMemoUrl(publicId: string): string {
  return `${WEB_BASE_URL.replace(/\/+$/, "")}/explore/${publicId}`;
}

function getMutationError(error: unknown): string | null {
  if (!error) {
    return null;
  }
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "操作失败";
}

function formatTime(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const dateText = year === now.getFullYear() ? `${month}-${day}` : `${year}-${month}-${day}`;
  return `${dateText} ${hour}:${minute}`;
}

const colors = {
  background: "#f5f4f0",
  surface: "#ffffff",
  surfaceAlt: "#f0f7f4",
  ink: "#1c1f1e",
  muted: "#767d78",
  border: "#ddd8cf",
  accent: "#0f8a5f",
  accentDark: "#0b6044",
  onAccent: "#ffffff",
  danger: "#b3342f",
  dangerSoft: "#fff0ee"
};

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: colors.background
  },
  authShell: {
    flex: 1,
    backgroundColor: colors.background
  },
  keyboardShell: {
    flex: 1,
    justifyContent: "center",
    padding: 20
  },
  authPanel: {
    gap: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    padding: 20
  },
  brand: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "800"
  },
  brandSmall: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  authTitle: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "800"
  },
  authSubtitle: {
    color: colors.muted,
    fontSize: 14
  },
  centerShell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: colors.background
  },
  mutedText: {
    color: colors.muted
  },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12
  },
  topbarTitle: {
    maxWidth: 230,
    color: colors.ink,
    fontSize: 25,
    fontWeight: "800"
  },
  profileName: {
    maxWidth: 110,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  segmented: {
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12
  },
  segment: {
    minWidth: 64,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  segmentSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent
  },
  segmentText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700"
  },
  segmentTextSelected: {
    color: colors.onAccent
  },
  listContent: {
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 32
  },
  listHeader: {
    gap: 12
  },
  searchBox: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: 14
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 16
  },
  tagStrip: {
    gap: 8,
    paddingVertical: 2
  },
  tagChip: {
    maxWidth: 160,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.surface,
    paddingHorizontal: 11
  },
  tagChipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent
  },
  tagIcon: {
    fontSize: 14
  },
  tagChipText: {
    maxWidth: 96,
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700"
  },
  tagChipTextSelected: {
    color: colors.onAccent
  },
  tagCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  clearTagButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    backgroundColor: "#ece8df",
    paddingHorizontal: 11
  },
  clearTagText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700"
  },
  toolbarRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  composer: {
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    padding: 12
  },
  composerInput: {
    minHeight: 120,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 23
  },
  composerFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  counter: {
    color: colors.muted,
    fontSize: 12
  },
  memoCard: {
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    padding: 14
  },
  memoCardPinned: {
    borderColor: "#acd8c4",
    backgroundColor: colors.surfaceAlt
  },
  memoMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  memoTime: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  pinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    backgroundColor: "#dff2e9",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  pinBadgeText: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: "800"
  },
  memoContent: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24
  },
  memoTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  iconButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: "#fbfaf7",
    paddingHorizontal: 10
  },
  iconButtonDanger: {
    borderColor: "#f1c4bf",
    backgroundColor: colors.dangerSoft
  },
  iconButtonText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700"
  },
  iconButtonDangerText: {
    color: colors.danger
  },
  editInput: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.ink,
    backgroundColor: "#fbfaf7",
    padding: 12,
    fontSize: 16,
    lineHeight: 23
  },
  randomPanel: {
    gap: 10,
    borderWidth: 1,
    borderColor: "#b7d8c9",
    borderRadius: 8,
    backgroundColor: "#eaf7f1",
    padding: 10
  },
  randomHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  randomTitle: {
    color: colors.accentDark,
    fontSize: 14,
    fontWeight: "800"
  },
  settingsContent: {
    gap: 14,
    paddingHorizontal: 16,
    paddingBottom: 32
  },
  settingsSection: {
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    padding: 14
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  accountText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  inputGroup: {
    gap: 7
  },
  inputLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  textInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.ink,
    backgroundColor: "#fbfaf7",
    paddingHorizontal: 12,
    fontSize: 16
  },
  primaryButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 14
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: "800"
  },
  secondaryButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: 12
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800"
  },
  dangerButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#f1c4bf",
    borderRadius: 8,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: 12
  },
  dangerButtonText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "800"
  },
  buttonDisabled: {
    opacity: 0.55
  },
  errorBanner: {
    borderRadius: 8,
    backgroundColor: colors.dangerSoft,
    padding: 10
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700"
  },
  inlineLoader: {
    paddingVertical: 8
  },
  emptyState: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 44
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800"
  },
  emptySubtitle: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center"
  }
});
