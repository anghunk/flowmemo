import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
	Archive,
	ArrowDownUp,
	ArrowDownNarrowWide,
	ArrowUpNarrowWide,
	Bot,
	Check,
	ChevronDown,
	ChevronRight,
	ClockArrowUp,
	Copy,
	CreditCard,
	Crown,
	Download,
	Grid2X2,
	Globe2,
	Hash,
	Home,
	ImagePlus,
	KeyRound,
	ListChecks,
	LoaderCircle,
	LogOut,
	Mail,
	Menu,
	MoreHorizontal,
	Pin,
	Search,
	Settings,
	ShieldCheck,
	Sparkles,
	Shuffle,
	Trash2,
	UserRound,
	X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AdminInviteCode, AdminUser, MemoListQuery, UserPlan } from '@flowmemo/shared';
import type { Memo, Tag } from '@flowmemo/shared';
import { toast } from 'sonner';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { CalendarHeatmap } from '../components/CalendarHeatmap';
import { MemoComposer } from '../components/MemoComposer';
import { MemoList } from '../components/MemoList';
import { Button } from '../components/ui/Button';
import { FloatingMenu } from '../components/ui/FloatingMenu';
import type { FloatingMenuItem } from '../components/ui/FloatingMenu';
import { Input } from '../components/ui/Input';
import { PasswordInput } from '../components/ui/PasswordInput';
import {
	useAdminInvites,
	useAdminUsers,
	useCreateAdminInvite,
	useUpdateInviteRegistration,
	useUpdateUserMembership,
} from '../hooks/useAdmin';
import { useAiEntitlement } from '../hooks/useAi';
import { useLogout, useMe, useUpdateProfile } from '../hooks/useAuth';
import {
	useCalendarStats,
	useClearArchivedMemos,
	useInfiniteMemos,
	useOverviewStats,
	usePublishedMemos,
	useTags,
	useUpdateMemo,
	useUpdateTagIcon,
} from '../hooks/useMemos';
import { api, ApiError } from '../lib/api';
import { cn } from '../lib/cn';

type ViewMode =
	| 'all'
	| 'pinned'
	| 'archive'
	| 'published'
	| 'random'
	| 'profile'
	| 'settings'
	| 'subscription'
	| 'ai'
	| 'admin';
type SortMode = 'created-desc' | 'created-asc' | 'updated-desc';

const SUBSCRIPTION_CONTACT_EMAIL = import.meta.env.VITE_SUBSCRIPTION_CONTACT_EMAIL?.trim() ?? '';

const TagEmojiPicker = lazy(() =>
	import('../components/TagEmojiPicker').then((module) => ({ default: module.TagEmojiPicker })),
);

type AppLayoutProps = {
	initialView?: ViewMode;
};

type RouteViewState = {
	view: ViewMode;
	tag?: string;
};

const sortOptions: Array<{ value: SortMode; label: string; description: string; icon: ReactNode }> = [
	{
		value: 'created-desc',
		label: '创建时间',
		description: '从新到旧',
		icon: <ArrowDownNarrowWide size={17} />,
	},
	{
		value: 'created-asc',
		label: '创建时间',
		description: '从旧到新',
		icon: <ArrowUpNarrowWide size={17} />,
	},
	{
		value: 'updated-desc',
		label: '更新时间',
		description: '最近更新',
		icon: <ClockArrowUp size={17} />,
	},
];

const legacyTagIconEmoji: Record<string, string> = {
	book: '📖',
	briefcase: '💼',
	calendar: '📅',
	code: '💻',
	heart: '❤️',
	home: '🏠',
	lightbulb: '💡',
	star: '⭐',
	user: '👤',
};

/**
 * 获取标签图标展示文本，兼容旧版内置图标 id。
 */
function getTagIconText(icon: string | null | undefined): string | null {
	if (!icon) {
		return null;
	}
	return legacyTagIconEmoji[icon] ?? icon;
}

/**
 * 渲染标签图标，未设置时显示井号。
 */
function TagIcon({ icon, size = 15 }: { icon: string | null | undefined; size?: number }) {
	const iconText = getTagIconText(icon);
	if (!iconText) {
		return <Hash size={size} />;
	}
	return (
		<span
			className='tag-emoji-icon'
			style={{ fontSize: size + 1 }}
			aria-hidden='true'
		>
			{iconText}
		</span>
	);
}

/**
 * 获取排序方式说明。
 */
function getSortDescription(sortMode: SortMode): string {
	const option = sortOptions.find((item) => item.value === sortMode);
	return option ? `${option.label}，${option.description}` : '创建时间，从新到旧';
}

/**
 * 按当前排序方式整理 memo 列表。
 */
function sortMemos(memos: Memo[], sortMode: SortMode): Memo[] {
	return [...memos].sort((left, right) => {
		if (left.pinned !== right.pinned) {
			return left.pinned ? -1 : 1;
		}
		if (sortMode === 'created-asc') {
			return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
		}
		if (sortMode === 'updated-desc') {
			return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
		}
		return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
	});
}

/**
 * 在浏览器中下载 blob 文件。
 */
function downloadBlob(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	anchor.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatProfileDate(value: string | undefined): string {
	if (!value) {
		return '未知';
	}
	return new Date(value).toLocaleDateString('zh-CN', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
}

function formatDateTime(value: string | null | undefined): string {
	if (!value) {
		return '未使用';
	}
	return new Date(value).toLocaleString('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	});
}

/**
 * 获取月份查询范围。
 */
function getHeatmapRange(weeks: number): { from: string; to: string } {
	const today = new Date();
	const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
	const start = new Date(end);
	start.setDate(end.getDate() - weeks * 7);
	const from = start.toISOString();
	const to = end.toISOString();
	return { from, to };
}

/**
 * 获取本地时区相对 UTC 的分钟偏移，用于热力图按本地日期聚合。
 */
function getLocalUtcOffsetMinutes(): number {
	return -new Date().getTimezoneOffset();
}

/**
 * 根据视图生成应用内路由。
 */
function getViewPath(view: ViewMode): string {
	if (view === 'pinned') {
		return '/app/pinned';
	}
	if (view === 'archive') {
		return '/app/archive';
	}
	if (view === 'published') {
		return '/app/published';
	}
	if (view === 'random') {
		return '/app/random';
	}
	if (view === 'settings') {
		return '/app/settings';
	}
	if (view === 'profile') {
		return '/app/profile';
	}
	if (view === 'subscription') {
		return '/app/subscription';
	}
	if (view === 'ai') {
		return '/app/ai';
	}
	if (view === 'admin') {
		return '/app/admin';
	}
	return '/app';
}

/**
 * 根据标签名称生成标签筛选路由。
 */
function getTagPath(tagName: string): string {
	return `/app/tags/${encodeURIComponent(tagName)}`;
}

/**
 * 从当前路径解析应用视图状态。
 */
function getRouteViewState(pathname: string, fallbackView: ViewMode): RouteViewState {
	const normalizedPath = pathname.replace(/\/+$/, '') || '/';

	if (normalizedPath === '/app/pinned') {
		return { view: 'pinned' };
	}
	if (normalizedPath === '/app/archive') {
		return { view: 'archive' };
	}
	if (normalizedPath === '/app/published') {
		return { view: 'published' };
	}
	if (normalizedPath === '/app/random') {
		return { view: 'random' };
	}
	if (normalizedPath === '/app/settings' || normalizedPath === '/settings') {
		return { view: 'settings' };
	}
	if (normalizedPath === '/app/profile' || normalizedPath === '/profile') {
		return { view: 'profile' };
	}
	if (normalizedPath === '/app/subscription') {
		return { view: 'subscription' };
	}
	if (normalizedPath === '/app/ai') {
		return { view: 'ai' };
	}
	if (normalizedPath === '/app/admin') {
		return { view: 'admin' };
	}
	if (normalizedPath.startsWith('/app/tags/')) {
		const encodedTag = normalizedPath.slice('/app/tags/'.length);
		if (encodedTag) {
			try {
				return { view: 'all', tag: decodeURIComponent(encodedTag) };
			} catch {
				return { view: 'all' };
			}
		}
	}
	return { view: fallbackView };
}

/**
 * Web 应用主页面。
 */
export function AppLayout({ initialView = 'all' }: AppLayoutProps) {
	return (
		<ProtectedRoute>
			<AppContent initialView={initialView} />
		</ProtectedRoute>
	);
}

type AppContentProps = {
	initialView: ViewMode;
};

/**
 * 登录后的 memo 工作台。
 */
function AppContent({ initialView }: AppContentProps) {
	const location = useLocation();
	const navigate = useNavigate();
	const appMainRef = useRef<HTMLElement>(null);
	const routeState = useMemo(() => getRouteViewState(location.pathname, initialView), [initialView, location.pathname]);
	const { view, tag } = routeState;
	const [q, setQ] = useState('');
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [randomMemo, setRandomMemo] = useState<Memo | null>(null);
	const [randomMemoLoading, setRandomMemoLoading] = useState(false);
	const [randomMemoError, setRandomMemoError] = useState<string | null>(null);
	const randomRouteAutoLoadRef = useRef(false);
	const [oldPassword, setOldPassword] = useState('');
	const [nickname, setNickname] = useState('');
	const [nicknameDraft, setNicknameDraft] = useState('');
	const [nicknameDialogOpen, setNicknameDialogOpen] = useState(false);
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
	const [passwordSubmitting, setPasswordSubmitting] = useState(false);
	const [titleMenuOpen, setTitleMenuOpen] = useState(false);
	const [profileMenuOpen, setProfileMenuOpen] = useState<'mobile' | 'desktop' | null>(null);
	const [sortMode, setSortMode] = useState<SortMode>('created-desc');
	const [selectionMode, setSelectionMode] = useState(false);
	const [selectedMemoIds, setSelectedMemoIds] = useState<string[]>([]);
	const [exporting, setExporting] = useState(false);
	const [tagsExpanded, setTagsExpanded] = useState(true);
	const [tagSearchOpen, setTagSearchOpen] = useState(false);
	const [tagSearch, setTagSearch] = useState('');
	const [tagMenuOpen, setTagMenuOpen] = useState<string | null>(null);
	const [iconDialogTagId, setIconDialogTagId] = useState<string | null>(null);
	const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(initialView === 'subscription');
	const { data: userData } = useMe();
	const logout = useLogout();
	const updateProfile = useUpdateProfile();
	const updateMemo = useUpdateMemo();
	const clearArchivedMemos = useClearArchivedMemos();
	const updateTagIcon = useUpdateTagIcon();
	const isAdmin = userData?.user.role === 'admin';
	const heatmapWeeks = 18;
	const range = useMemo(() => getHeatmapRange(heatmapWeeks), []);
	const heatmapUtcOffsetMinutes = useMemo(() => getLocalUtcOffsetMinutes(), []);
	const calendar = useCalendarStats(range.from, range.to, heatmapUtcOffsetMinutes);
	const overview = useOverviewStats();
	const tags = useTags();
	const publishedMemos = usePublishedMemos();
	const canUploadImages = userData?.user.plan === 'member';

	useLayoutEffect(() => {
		appMainRef.current?.scrollTo({ top: 0, left: 0 });
	}, [location.pathname, location.search]);

	const query: MemoListQuery = {
		view:
			view === 'settings' ||
			view === 'profile' ||
			view === 'subscription' ||
			view === 'ai' ||
			view === 'admin' ||
			view === 'published' ||
			view === 'random'
				? 'all'
				: view,
		tag,
		q,
		limit: 30,
	};
	const memos = useInfiniteMemos(query);
	const title = tag
		? `#${tag}`
		: view === 'settings'
			? '偏好设置'
			: view === 'profile'
				? '个人信息'
				: view === 'subscription'
					? '订阅'
					: view === 'admin'
						? '管理员后台'
						: view === 'ai'
							? 'Agent'
							: view === 'random'
								? '随机漫游'
								: view === 'archive'
									? '归档'
									: view === 'published'
										? '公开笔记'
										: view === 'pinned'
											? '置顶'
											: '全部笔记';
	const displayName = userData?.user.nickname || userData?.user.account || 'FlowMemo';
	const canUseAllNotesMenu = view === 'all' && !tag;
	const canReturnToAllNotes =
		!canUseAllNotesMenu &&
		view !== 'settings' &&
		view !== 'profile' &&
		view !== 'ai' &&
		view !== 'admin' &&
		view !== 'published';
	const visibleMemos = useMemo(() => {
		const currentMemos = memos.data?.pages.flatMap((page) => page.memos) ?? [];
		return canUseAllNotesMenu ? sortMemos(currentMemos, sortMode) : currentMemos;
	}, [canUseAllNotesMenu, memos.data?.pages, sortMode]);
	const loadMoreMemos = useCallback(() => {
		if (!memos.hasNextPage || memos.isFetchingNextPage) {
			return;
		}
		void memos.fetchNextPage();
	}, [memos.fetchNextPage, memos.hasNextPage, memos.isFetchingNextPage]);
	const visiblePublishedMemos = useMemo(() => {
		const currentMemos = publishedMemos.data?.memos.map((item) => item.memo) ?? [];
		const keyword = q.trim().toLocaleLowerCase();
		if (!keyword) {
			return currentMemos;
		}
		return currentMemos.filter((memo) => memo.content.toLocaleLowerCase().includes(keyword));
	}, [publishedMemos.data?.memos, q]);
	const visibleTags = useMemo(() => {
		const allTags = tags.data?.tags ?? [];
		const keyword = tagSearch.trim().toLocaleLowerCase();
		if (!keyword) {
			return allTags.slice(0, 12);
		}
		return allTags.filter((item) => item.name.toLocaleLowerCase().includes(keyword));
	}, [tagSearch, tags.data?.tags]);
	const iconDialogTag = useMemo(
		() => (tags.data?.tags ?? []).find((item) => item.id === iconDialogTagId) ?? null,
		[iconDialogTagId, tags.data?.tags],
	);
	const selectedMemoIdSet = useMemo(() => new Set(selectedMemoIds), [selectedMemoIds]);
	const allVisibleSelected = visibleMemos.length > 0 && visibleMemos.every((memo) => selectedMemoIdSet.has(memo.id));
	const profileMenuItems: FloatingMenuItem[] = [
		...(isAdmin
			? [
					{
						id: 'admin',
						label: '管理员后台',
						icon: <ShieldCheck size={17} />,
						onSelect: () => selectView('admin'),
					},
					{
						id: 'admin-separator',
						type: 'separator' as const,
					},
				]
			: []),
		{
			id: 'profile',
			label: '个人信息',
			icon: <UserRound size={17} />,
			onSelect: () => selectView('profile'),
		},
		{
			id: 'subscription',
			label: '权益与订阅',
			icon: <CreditCard size={17} />,
			onSelect: openSubscriptionDialog,
		},
		{
			id: 'settings',
			label: '偏好设置',
			icon: <Settings size={17} />,
			onSelect: () => selectView('settings'),
		},
		{
			id: 'logout',
			label: logout.isPending ? '退出中' : '退出',
			icon: <LogOut size={17} />,
			disabled: logout.isPending,
			onSelect: () => logout.mutate(),
		},
	];
	const allNotesMenuItems: FloatingMenuItem[] = [
		{
			id: 'sort',
			label: '排序方式',
			description: getSortDescription(sortMode),
			icon: <ArrowDownUp size={17} />,
			children: sortOptions.map((option) => ({
				id: option.value,
				label: option.label,
				description: option.description,
				icon: option.icon,
				trailing: sortMode === option.value ? <Check size={16} /> : undefined,
				onSelect: () => setSortMode(option.value),
			})),
		},
		{
			id: 'select',
			label: selectionMode ? '退出多选' : '多选笔记',
			icon: <ListChecks size={17} />,
			onSelect: selectionMode ? exitSelectionMode : enterSelectionMode,
		},
		{
			id: 'export',
			label: exporting ? '导出中' : '导出',
			description: 'Markdown 文件',
			icon: <Download size={17} />,
			disabled: exporting,
			onSelect: handleExportMemos,
		},
	];

	useEffect(() => {
		setNickname(userData?.user.nickname ?? '');
		if (!nicknameDialogOpen) {
			setNicknameDraft(userData?.user.nickname ?? '');
		}
	}, [nicknameDialogOpen, userData?.user.nickname]);

	useEffect(() => {
		setSidebarOpen(false);
		setSelectionMode(false);
		setSelectedMemoIds([]);
	}, [location.pathname]);

	useEffect(() => {
		if (view !== 'subscription') {
			return;
		}
		setSubscriptionDialogOpen(true);
		navigate('/app', { replace: true });
	}, [navigate, view]);

	useEffect(() => {
		if (view === 'admin' && userData && !isAdmin) {
			navigate('/app', { replace: true });
		}
	}, [isAdmin, navigate, userData, view]);

	useEffect(() => {
		if (view !== 'random') {
			randomRouteAutoLoadRef.current = false;
			return;
		}
		if (!randomRouteAutoLoadRef.current && !randomMemo && !randomMemoLoading && !randomMemoError) {
			randomRouteAutoLoadRef.current = true;
			void roamRandomMemo();
		}
	}, [randomMemo, randomMemoError, randomMemoLoading, view]);

	/**
	 * 打开移动端侧边栏。
	 */
	function openMobileSidebar() {
		setSidebarOpen(true);
	}

	/**
	 * 关闭移动端侧边栏，并收起侧边栏内的浮层菜单。
	 */
	function closeMobileSidebar() {
		setSidebarOpen(false);
		setProfileMenuOpen(null);
		setTagMenuOpen(null);
	}

	/**
	 * 切换快捷视图。
	 */
	function selectView(nextView: ViewMode) {
		navigate(getViewPath(nextView));
		closeMobileSidebar();
		setSelectionMode(false);
		setSelectedMemoIds([]);
	}

	/**
	 * 打开权益与计划弹窗。
	 */
	function openSubscriptionDialog() {
		setSubscriptionDialogOpen(true);
		closeMobileSidebar();
	}

	/**
	 * 打开随机漫游页面；重复点击时重新抽取一条 memo。
	 */
	function openRandomRoam() {
		if (view === 'random') {
			void roamRandomMemo();
			return;
		}
		setRandomMemo(null);
		setRandomMemoError(null);
		randomRouteAutoLoadRef.current = false;
		selectView('random');
	}

	/**
	 * 选择标签筛选。
	 */
	function selectTag(nextTag: string) {
		navigate(getTagPath(nextTag));
		closeMobileSidebar();
		setSelectionMode(false);
		setSelectedMemoIds([]);
	}

	/**
	 * 切换标签列表展开状态。
	 */
	function toggleTagsExpanded() {
		setTagsExpanded((current) => !current);
	}

	/**
	 * 切换标签搜索框展示状态。
	 */
	function toggleTagSearch() {
		setTagsExpanded(true);
		setTagSearchOpen((current) => {
			if (current) {
				setTagSearch('');
			}
			return !current;
		});
	}

	/**
	 * 生成单个标签的更多菜单项。
	 */
	function getTagMenuItems(item: Tag): FloatingMenuItem[] {
		return [
			{
				id: 'change-icon',
				label: '更换图标',
				icon: (
					<TagIcon
						icon={item.icon}
						size={17}
					/>
				),
				onSelect: () => {
					setTagMenuOpen(null);
					setIconDialogTagId(item.id);
				},
			},
		];
	}

	/**
	 * 保存标签图标设置。
	 */
	function updateSelectedTagIcon(item: Tag, icon: string | null) {
		updateTagIcon.mutate(
			{ id: item.id, icon },
			{
				onSuccess: () => {
					toast.success('标签图标已更新');
					setIconDialogTagId(null);
				},
			},
		);
	}

	/**
	 * 进入 memo 多选模式。
	 */
	function enterSelectionMode() {
		setSelectionMode(true);
		setSelectedMemoIds([]);
	}

	/**
	 * 退出 memo 多选模式。
	 */
	function exitSelectionMode() {
		setSelectionMode(false);
		setSelectedMemoIds([]);
	}

	/**
	 * 切换单条 memo 的选中状态。
	 */
	function toggleMemoSelection(memoId: string) {
		setSelectedMemoIds((current) =>
			current.includes(memoId) ? current.filter((id) => id !== memoId) : [...current, memoId],
		);
	}

	/**
	 * 选择或取消选择当前可见 memo。
	 */
	function toggleVisibleSelection() {
		if (allVisibleSelected) {
			setSelectedMemoIds((current) => current.filter((id) => !visibleMemos.some((memo) => memo.id === id)));
			return;
		}
		setSelectedMemoIds((current) => Array.from(new Set([...current, ...visibleMemos.map((memo) => memo.id)])));
	}

	/**
	 * 批量归档已选择的 memo。
	 */
	async function archiveSelectedMemos() {
		if (selectedMemoIds.length === 0) {
			return;
		}
		try {
			await Promise.all(selectedMemoIds.map((id) => updateMemo.mutateAsync({ id, archived: true })));
			toast.success(`已归档 ${selectedMemoIds.length} 条笔记`);
			exitSelectionMode();
		} catch {
			// useUpdateMemo 已负责展示错误提示。
		}
	}

	/**
	 * 清空当前用户的所有归档 memo。
	 */
	async function clearAllArchivedMemos() {
		if (clearArchivedMemos.isPending || visibleMemos.length === 0) {
			return;
		}
		const confirmed = window.confirm('确认永久删除归档中的所有 memo？此操作不可恢复。');
		if (!confirmed) {
			return;
		}
		try {
			await clearArchivedMemos.mutateAsync();
			exitSelectionMode();
		} catch {
			// useClearArchivedMemos 已负责展示错误提示。
		}
	}

	/**
	 * 导出全部 memo 为 Markdown 文件。
	 */
	async function handleExportMemos() {
		setExporting(true);
		try {
			const blob = await api.exportMemos('markdown');
			downloadBlob(blob, `flowmemo-export-${new Date().toISOString().slice(0, 10)}.md`);
			toast.success('导出已开始');
		} catch (error) {
			toast.error(error instanceof ApiError ? error.message : '导出失败');
		} finally {
			setExporting(false);
		}
	}

	/**
	 * 随机漫游一条历史 memo。
	 */
	async function roamRandomMemo() {
		if (randomMemoLoading) {
			return;
		}

		setRandomMemoLoading(true);
		setRandomMemoError(null);
		try {
			const result = await api.randomMemo();
			setRandomMemo(result.memo);
		} catch (error) {
			const message = error instanceof ApiError ? error.message : '随机漫游失败';
			setRandomMemoError(message);
			toast.error(message);
		} finally {
			setSidebarOpen(false);
			setRandomMemoLoading(false);
		}
	}

	/**
	 * 提交修改密码表单。
	 */
	async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (newPassword !== confirmPassword) {
			toast.error('两次输入的新密码不一致');
			return;
		}

		setPasswordSubmitting(true);
		try {
			await api.changePassword(oldPassword, newPassword);
			setOldPassword('');
			setNewPassword('');
			setConfirmPassword('');
			setPasswordDialogOpen(false);
			toast.success('密码已更新');
		} catch (error) {
			toast.error(error instanceof ApiError ? error.message : '修改失败');
		} finally {
			setPasswordSubmitting(false);
		}
	}

	/**
	 * 提交昵称修改表单。
	 */
	function handleProfileChange(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		updateProfile.mutate(
			{ nickname: nicknameDraft },
			{
				onSuccess: () => setNicknameDialogOpen(false),
			},
		);
	}

	/**
	 * 打开昵称修改弹窗，并带入当前资料值。
	 */
	function openNicknameDialog() {
		setNicknameDraft(nickname);
		setNicknameDialogOpen(true);
	}

	/**
	 * 打开密码修改弹窗，并重置未提交的输入。
	 */
	function openPasswordDialog() {
		setOldPassword('');
		setNewPassword('');
		setConfirmPassword('');
		setPasswordDialogOpen(true);
	}

	/**
	 * 渲染侧边栏内容。
	 */
	function renderSidebar(scope: 'mobile' | 'desktop') {
		return (
			<aside className='app-sidebar'>
				<section className='profile-panel'>
					<FloatingMenu
						open={profileMenuOpen === scope}
						items={profileMenuItems}
						onOpenChange={(open) => setProfileMenuOpen(open ? scope : null)}
						className='profile-menu'
						trigger={({ open, toggle }) => (
							<button
								type='button'
								className='profile-menu-trigger'
								data-open={open ? 'true' : undefined}
								aria-haspopup='menu'
								aria-expanded={open}
								onClick={toggle}
							>
								<span className='min-w-0 truncate'>{displayName}</span>
								<span
									className='profile-badge'
									data-plan={userData?.user.plan}
								>
									{userData?.user.plan === 'member' ? 'PRO' : 'FREE'}
								</span>
								<ChevronDown size={15} />
							</button>
						)}
					/>
					<div className='profile-stats'>
						<div>
							<strong>{overview.data?.totalMemos ?? 0}</strong>
							<span>笔记</span>
						</div>
						<div>
							<strong>{overview.data?.totalTags ?? 0}</strong>
							<span>标签</span>
						</div>
						<div>
							<strong>{overview.data?.activeDays ?? 0}</strong>
							<span>天</span>
						</div>
					</div>
					<CalendarHeatmap
						stats={calendar.data?.days ?? []}
						weeks={heatmapWeeks}
					/>
				</section>

				<nav className='sidebar-section space-y-1'>
					<SidebarButton
						active={view === 'all' && !tag}
						icon={<Grid2X2 size={16} />}
						onClick={() => selectView('all')}
					>
						全部笔记
					</SidebarButton>
					<SidebarButton
						active={view === 'pinned'}
						icon={<Pin size={16} />}
						onClick={() => selectView('pinned')}
					>
						置顶
					</SidebarButton>
					<SidebarButton
						active={view === 'archive'}
						icon={<Archive size={16} />}
						onClick={() => selectView('archive')}
					>
						归档
					</SidebarButton>
					<SidebarButton
						active={view === 'published'}
						icon={<Globe2 size={16} />}
						onClick={() => selectView('published')}
					>
						公开笔记
					</SidebarButton>
					<SidebarButton
						active={view === 'ai'}
						icon={<Bot size={16} />}
						onClick={() => selectView('ai')}
					>
						Agent
					</SidebarButton>
					<SidebarButton
						active={view === 'random'}
						icon={<Shuffle size={16} />}
						onClick={openRandomRoam}
					>
						随机漫游
					</SidebarButton>
				</nav>

				<section className='sidebar-section tag-section'>
					<div className='tag-section-heading'>
						<button
							type='button'
							className='tag-section-header'
							aria-expanded={tagsExpanded}
							onClick={toggleTagsExpanded}
						>
							<span>全部标签</span>
							<ChevronDown
								className='tag-section-arrow'
								size={14}
							/>
						</button>
						<button
							type='button'
							className='tag-search-toggle'
							data-active={tagSearchOpen ? 'true' : undefined}
							aria-label={tagSearchOpen ? '关闭标签搜索' : '搜索标签'}
							aria-pressed={tagSearchOpen}
							title={tagSearchOpen ? '关闭标签搜索' : '搜索标签'}
							onClick={toggleTagSearch}
						>
							<Search size={15} />
						</button>
					</div>
					{tagsExpanded && (
						<div className='tag-section-body'>
							{tagSearchOpen && (
								<div className='tag-search-shell'>
									<Search
										className='pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a3a3a3]'
										size={14}
									/>
									<Input
										className='tag-search-input'
										value={tagSearch}
										onChange={(event) => setTagSearch(event.target.value)}
										placeholder='搜索标签'
										autoFocus
									/>
								</div>
							)}
							<div className='space-y-1'>
								{visibleTags.map((item) => (
									<TagSidebarItem
										key={item.id}
										tag={item}
										active={tag === item.name}
										menuOpen={tagMenuOpen === `${scope}:${item.id}`}
										menuItems={getTagMenuItems(item)}
										onMenuOpenChange={(open) => setTagMenuOpen(open ? `${scope}:${item.id}` : null)}
										onSelect={() => selectTag(item.name)}
									/>
								))}
								{(tags.data?.tags ?? []).length === 0 && <p className='px-2 text-sm text-muted-foreground'>暂无标签</p>}
								{(tags.data?.tags ?? []).length > 0 && visibleTags.length === 0 && (
									<p className='px-2 text-sm text-muted-foreground'>没有匹配标签</p>
								)}
							</div>
						</div>
					)}
				</section>
			</aside>
		);
	}

	return (
		<div className='app-shell'>
			<button
				type='button'
				className={cn('mobile-sidebar-backdrop', sidebarOpen && 'is-open')}
				aria-label='关闭侧边栏'
				tabIndex={sidebarOpen ? 0 : -1}
				onClick={closeMobileSidebar}
			/>
			<div
				id='mobile-app-sidebar'
				className={cn('mobile-sidebar', sidebarOpen && 'is-open')}
			>
				{renderSidebar('mobile')}
			</div>
			<div className='desktop-sidebar'>{renderSidebar('desktop')}</div>

			<main
				ref={appMainRef}
				className='app-main'
			>
				<header className='app-topbar'>
					<Button
						type='button'
						variant='ghost'
						size='icon'
						className='lg:hidden'
						aria-controls='mobile-app-sidebar'
						aria-expanded={sidebarOpen}
						onClick={openMobileSidebar}
					>
						<Menu size={18} />
					</Button>
					<div className='min-w-0'>
						{canUseAllNotesMenu ? (
							<FloatingMenu
								open={titleMenuOpen}
								items={allNotesMenuItems}
								onOpenChange={setTitleMenuOpen}
								trigger={({ open, toggle }) => (
									<button
										type='button'
										className='title-menu-trigger'
										data-open={open ? 'true' : undefined}
										aria-haspopup='menu'
										aria-expanded={open}
										onClick={toggle}
									>
										<span className='truncate'>{title}</span>
										<ChevronDown size={16} />
									</button>
								)}
							/>
						) : (
							<h1 className='title-menu-trigger title-heading'>
								{canReturnToAllNotes && (
									<button
										type='button'
										className='title-home-button'
										aria-label='返回全部笔记'
										title='返回全部笔记'
										onClick={() => selectView('all')}
									>
										<Home size={15} />
									</button>
								)}
								{canReturnToAllNotes && <span className='title-home-demerger'>/</span>}
								<span className='truncate'>{title}</span>
							</h1>
						)}
					</div>
					<div className='ml-auto flex items-center gap-2'>
						{view === 'archive' && !selectionMode && (
							<Button
								type='button'
								variant='danger'
								size='sm'
								disabled={memos.isLoading || visibleMemos.length === 0 || clearArchivedMemos.isPending}
								onClick={clearAllArchivedMemos}
							>
								<Trash2 size={15} />
								{clearArchivedMemos.isPending ? '删除中' : '清空归档'}
							</Button>
						)}
						{view !== 'random' && (
							<div className='search-shell hidden sm:block'>
								<Search
									className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8f8f8f]'
									size={17}
								/>
								<Input
									className='search-input'
									value={q}
									onChange={(event) => setQ(event.target.value)}
									placeholder='⌘ + K'
								/>
							</div>
						)}
					</div>
				</header>

				<motion.div
					key={`${view}-${tag ?? ''}`}
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.16 }}
					className='mx-auto w-full max-w-[666[x]] px-4 pt-2 pb-10 sm:px-0'
				>
					{view !== 'random' && (
						<div className='mb-4 sm:hidden'>
							<Input
								value={q}
								onChange={(event) => setQ(event.target.value)}
								placeholder='搜索 memo'
							/>
						</div>
					)}
					{view === 'settings' ? (
						<SettingsPanel />
					) : view === 'published' ? (
						<PublishedPanel
							loading={publishedMemos.isLoading}
							memos={visiblePublishedMemos}
							viewerId={userData?.user.id}
							canUploadImages={canUploadImages}
							onTagSelect={selectTag}
						/>
					) : view === 'admin' && isAdmin ? (
						<AdminPanel />
					) : view === 'ai' ? (
						<AiComingSoonPanel />
					) : view === 'random' ? (
						<RandomRoamPanel
							memo={randomMemo}
							loading={randomMemoLoading}
							error={randomMemoError}
							viewerId={userData?.user.id}
							canUploadImages={canUploadImages}
							onRoam={roamRandomMemo}
							onTagSelect={selectTag}
						/>
					) : (
						<>
							{selectionMode && (
								<div className='selection-toolbar'>
									<div>
										<strong>已选择 {selectedMemoIds.length} 条</strong>
										<span>{getSortDescription(sortMode)}</span>
									</div>
									<div className='selection-actions'>
										<Button
											type='button'
											variant='ghost'
											size='sm'
											onClick={toggleVisibleSelection}
										>
											{allVisibleSelected ? '取消全选' : '全选'}
										</Button>
										<Button
											type='button'
											variant='secondary'
											size='sm'
											disabled={selectedMemoIds.length === 0 || updateMemo.isPending}
											onClick={archiveSelectedMemos}
										>
											<Archive size={15} />
											归档
										</Button>
										<Button
											type='button'
											variant='ghost'
											size='icon'
											title='退出多选'
											onClick={exitSelectionMode}
										>
											<X size={16} />
										</Button>
									</div>
								</div>
							)}
							{view !== 'archive' && !selectionMode && (
								<MemoComposer canUploadImages={userData?.user.plan === 'member'} />
							)}
							<MemoList
								memos={visibleMemos}
								loading={memos.isLoading}
								archiveView={view === 'archive'}
								viewerId={userData?.user.id}
								selectionMode={selectionMode}
								selectedMemoIds={selectedMemoIdSet}
								canUploadImages={canUploadImages}
								hasMore={Boolean(memos.hasNextPage)}
								loadingMore={memos.isFetchingNextPage}
								onLoadMore={loadMoreMemos}
								onToggleSelection={toggleMemoSelection}
								onTagSelect={selectTag}
							/>
						</>
					)}
				</motion.div>
			</main>
			{view === 'profile' && (
				<ProfilePanel
					account={userData?.user.account ?? ''}
					nickname={nickname}
					plan={userData?.user.plan ?? 'free'}
					createdAt={userData?.user.createdAt}
					totalMemos={overview.data?.totalMemos ?? 0}
					totalTags={overview.data?.totalTags ?? 0}
					activeDays={overview.data?.activeDays ?? 0}
					profileSubmitting={updateProfile.isPending}
					nicknameDraft={nicknameDraft}
					nicknameDialogOpen={nicknameDialogOpen}
					oldPassword={oldPassword}
					newPassword={newPassword}
					confirmPassword={confirmPassword}
					passwordDialogOpen={passwordDialogOpen}
					passwordSubmitting={passwordSubmitting}
					onNicknameChange={setNicknameDraft}
					onProfileSubmit={handleProfileChange}
					onOpenNicknameDialog={openNicknameDialog}
					onCloseNicknameDialog={() => setNicknameDialogOpen(false)}
					onOldPasswordChange={setOldPassword}
					onNewPasswordChange={setNewPassword}
					onConfirmPasswordChange={setConfirmPassword}
					onPasswordSubmit={handlePasswordChange}
					onOpenPasswordDialog={openPasswordDialog}
					onClosePasswordDialog={() => setPasswordDialogOpen(false)}
					onClose={() => selectView('all')}
					onOpenSubscription={openSubscriptionDialog}
				/>
			)}
			{subscriptionDialogOpen && (
				<SubscriptionPanel
					plan={userData?.user.plan ?? 'free'}
					onClose={() => setSubscriptionDialogOpen(false)}
				/>
			)}
			{iconDialogTag && (
				<TagIconDialog
					tag={iconDialogTag}
					submitting={updateTagIcon.isPending}
					onClose={() => setIconDialogTagId(null)}
					onSelectIcon={(icon) => updateSelectedTagIcon(iconDialogTag, icon)}
				/>
			)}
		</div>
	);
}

type ProfilePanelProps = {
	account: string;
	nickname: string;
	nicknameDraft: string;
	nicknameDialogOpen: boolean;
	oldPassword: string;
	newPassword: string;
	confirmPassword: string;
	passwordDialogOpen: boolean;
	plan: UserPlan;
	createdAt?: string;
	totalMemos: number;
	totalTags: number;
	activeDays: number;
	profileSubmitting: boolean;
	passwordSubmitting: boolean;
	onNicknameChange: (value: string) => void;
	onProfileSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onOpenNicknameDialog: () => void;
	onCloseNicknameDialog: () => void;
	onOldPasswordChange: (value: string) => void;
	onNewPasswordChange: (value: string) => void;
	onConfirmPasswordChange: (value: string) => void;
	onPasswordSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onOpenPasswordDialog: () => void;
	onClosePasswordDialog: () => void;
	onClose: () => void;
	onOpenSubscription: () => void;
};

/**
 * 随机漫游页面属性。
 */
type RandomRoamPanelProps = {
	memo: Memo | null;
	loading: boolean;
	error: string | null;
	viewerId?: string;
	canUploadImages?: boolean;
	onRoam: () => void;
	onTagSelect: (tag: string) => void;
};

/**
 * 随机展示一条历史 memo 的路由页面。
 */
function RandomRoamPanel({ memo, loading, error, viewerId, canUploadImages = false, onRoam, onTagSelect }: RandomRoamPanelProps) {
	return (
		<section className='random-roam-page'>
			<section
				className={cn('random-roam-panel', loading && 'is-loading')}
				aria-busy={loading}
			>
				{memo ? (
					<MemoList
						memos={[memo]}
						loading={false}
						archiveView={false}
						viewerId={viewerId}
						canUploadImages={canUploadImages}
						onTagSelect={onTagSelect}
					/>
				) : loading ? (
					<div className='memo-skeleton' />
				) : (
					<div className='random-roam-empty'>
						<p>{error ?? '暂无可漫游的 memo'}</p>
						<Button
							type='button'
							variant='ghost'
							size='sm'
							onClick={onRoam}
						>
							重新试试
						</Button>
					</div>
				)}
				{loading && (
					<div
						className='random-roam-loading'
						role='status'
					>
						<LoaderCircle size={18} />
						<span>随机漫游中</span>
					</div>
				)}
			</section>
		</section>
	);
}

type PublishedPanelProps = {
	loading: boolean;
	memos: Memo[];
	viewerId?: string;
	canUploadImages?: boolean;
	onTagSelect: (tag: string) => void;
};

/**
 * 当前用户已公开笔记列表。
 */
function PublishedPanel({ loading, memos, viewerId, canUploadImages = false, onTagSelect }: PublishedPanelProps) {
	return (
		<section className='published-panel'>
			<MemoList
				memos={memos}
				loading={loading}
				archiveView={false}
				viewerId={viewerId}
				canUploadImages={canUploadImages}
				onTagSelect={onTagSelect}
			/>
		</section>
	);
}

type SubscriptionPanelProps = {
	plan: UserPlan;
	onClose: () => void;
};

const subscriptionPlans: Array<{
	id: UserPlan;
	name: string;
	tagline: string;
	price: string;
	description: string;
	note: string;
	ctaLabel: string;
	benefits: Array<{ label: string; value: string; icon: ReactNode }>;
}> = [
	{
		id: 'free',
		name: 'FREE',
		tagline: '轻量开始记录',
		price: '免费',
		description: '适合日常文字 memo 与基础整理。',
		note: '注册后默认可用',
		ctaLabel: '默认可用',
		benefits: [
			{ label: '文字 memo', value: '无限记录', icon: <ListChecks size={17} /> },
			{ label: '标签整理', value: '自动识别', icon: <Hash size={17} /> },
			{ label: '随机漫游', value: '可用', icon: <Shuffle size={17} /> },
			{ label: '公开分享', value: '可用', icon: <Globe2 size={17} /> },
		],
	},
	{
		id: 'member',
		name: 'PRO',
		tagline: '记录更高效，回顾更从容',
		price: '联系开通',
		description: '加入图片上传与内置 AI，给长期记录更多空间。',
		note: '邮件联系开发者开通',
		ctaLabel: '联系开发者订阅',
		benefits: [
			{ label: '包含 FREE 权益', value: '全部', icon: <Check size={17} /> },
			{ label: '图片上传', value: '可用', icon: <ImagePlus size={17} /> },
			{ label: '内置 AI', value: '可用', icon: <Bot size={17} /> },
			{ label: '优先体验', value: '新功能', icon: <Sparkles size={17} /> },
		],
	},
];

const proHighlights: Array<{ title: string; description: string; icon: ReactNode }> = [
	{
		title: '图片进入记录流',
		description: '在 memo 里直接加入图片。',
		icon: <ImagePlus size={18} />,
	},
	{
		title: '内置 AI',
		description: '使用 FlowMemo 提供的 AI 模式。',
		icon: <Bot size={18} />,
	},
	{
		title: '优先体验',
		description: '新功能优先开放给 PRO。',
		icon: <Sparkles size={18} />,
	},
];

function SubscriptionPanel({ plan, onClose }: SubscriptionPanelProps) {
	const [contactOpen, setContactOpen] = useState(false);

	function openContactEmail() {
		setContactOpen(true);
	}

	function openMailClient() {
		if (!SUBSCRIPTION_CONTACT_EMAIL) {
			toast.error('尚未配置联系邮箱');
			return;
		}
		const subject = encodeURIComponent('FlowMemo PRO 订阅开通');
		window.location.href = `mailto:${SUBSCRIPTION_CONTACT_EMAIL}?subject=${subject}`;
	}

	async function copyContactEmail() {
		if (!SUBSCRIPTION_CONTACT_EMAIL) {
			toast.error('尚未配置联系邮箱');
			return;
		}
		try {
			await navigator.clipboard.writeText(SUBSCRIPTION_CONTACT_EMAIL);
			toast.success('邮箱已复制');
		} catch {
			toast.error('复制失败，请手动复制邮箱');
		}
	}

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				if (contactOpen) {
					setContactOpen(false);
					return;
				}
				onClose();
			}
		}

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [contactOpen, onClose]);

	return (
		<div
			className='subscription-dialog-backdrop'
			role='presentation'
			onMouseDown={onClose}
		>
			<section
				className='subscription-dialog'
				role='dialog'
				aria-modal='true'
				aria-labelledby='subscription-dialog-title'
				onMouseDown={(event) => event.stopPropagation()}
			>
				<div className='subscription-stars' />
				<header className='subscription-dialog-header'>
					<div>
						<p className='subscription-kicker'>权益与计划</p>
						<h2 id='subscription-dialog-title'>flowmemo</h2>
					</div>
					<div className='subscription-dialog-actions'>
						<span
							className='subscription-current-badge'
							data-plan={plan}
						>
							{plan === 'member' ? <Crown size={15} /> : <Sparkles size={15} />}
							{plan === 'member' ? 'PRO 已开通' : 'FREE 当前'}
						</span>
						<button
							type='button'
							className='subscription-dialog-close'
							aria-label='关闭权益与计划'
							title='关闭'
							onClick={onClose}
						>
							<X size={18} />
						</button>
					</div>
				</header>

				<div className='subscription-awards'>
					<span>编辑推荐</span>
					<span>专注推荐</span>
					<span>持续记录</span>
				</div>

				<div className='subscription-plan-grid'>
					{subscriptionPlans.map((item) => {
						const active = plan === item.id;
						return (
							<section
								key={item.id}
								className='subscription-plan'
								data-plan={item.id}
								data-active={active ? 'true' : undefined}
							>
								{item.id === 'member' && (
									<div className='subscription-featured-ribbon'>
										<Crown size={14} />
										{active ? '当前 PRO' : '推荐'}
									</div>
								)}
								<div className='subscription-plan-header'>
									<div>
										<h3>{item.name}</h3>
										<p className='subscription-plan-tagline'>{item.tagline}</p>
										<p>{item.description}</p>
									</div>
								</div>
								<ul>
									{item.benefits.map((benefit) => (
										<li key={benefit.label}>
											<span className='subscription-benefit-icon'>{benefit.icon}</span>
											<span>{benefit.label}</span>
											<strong>{benefit.value}</strong>
										</li>
									))}
								</ul>
								<div className='subscription-plan-footer'>
									<div className='subscription-plan-price'>
										<b>{item.price}</b>
										<small>{item.note}</small>
									</div>
									{item.id === 'member' ? (
										<Button
											type='button'
											className='subscription-plan-cta'
											variant={plan === 'member' ? 'ghost' : 'primary'}
											disabled={plan === 'member'}
											onClick={openContactEmail}
										>
											<Mail size={15} />
											{plan === 'member' ? '已订阅 PRO' : item.ctaLabel}
										</Button>
									) : (
										<Button
											type='button'
											className='subscription-plan-cta'
											variant='secondary'
											disabled
										>
											{item.ctaLabel}
										</Button>
									)}
								</div>
							</section>
						);
					})}
				</div>

				<div className='subscription-highlight-grid'>
					{proHighlights.map((item) => (
						<section
							key={item.title}
							className='subscription-highlight'
						>
							<div>{item.icon}</div>
							<h3>{item.title}</h3>
							<p>{item.description}</p>
						</section>
					))}
				</div>

				{contactOpen && (
					<div
						className='subscription-contact-backdrop'
						role='presentation'
						onMouseDown={() => setContactOpen(false)}
					>
						<section
							className='subscription-contact-dialog'
							role='dialog'
							aria-modal='true'
							aria-labelledby='subscription-contact-title'
							onMouseDown={(event) => event.stopPropagation()}
						>
							<button
								type='button'
								className='subscription-contact-close'
								aria-label='关闭'
								onClick={() => setContactOpen(false)}
							>
								<X size={16} />
							</button>
							<div className='subscription-contact-icon'>
								<Mail size={22} />
							</div>
							<h3 id='subscription-contact-title'>联系开发者开通 PRO</h3>
							<p>请发送邮件说明你的账号邮箱，开发者确认后会为你开通 PRO。</p>
							{SUBSCRIPTION_CONTACT_EMAIL ? (
								<a href={`mailto:${SUBSCRIPTION_CONTACT_EMAIL}`}>{SUBSCRIPTION_CONTACT_EMAIL}</a>
							) : (
								<span>当前部署尚未配置联系邮箱。</span>
							)}
							<div className='subscription-contact-actions'>
								<Button
									type='button'
									variant='secondary'
									onClick={copyContactEmail}
								>
									复制邮箱
								</Button>
								<Button
									type='button'
									onClick={openMailClient}
								>
									打开邮件
								</Button>
							</div>
						</section>
					</div>
				)}
			</section>
		</div>
	);
}

function AiComingSoonPanel() {
	const entitlement = useAiEntitlement();
	const modes = entitlement.data?.availableModes ?? ['custom'];

	return (
		<section className='ai-coming-soon-panel'>
			<div className='ai-coming-soon-icon'>
				<Bot size={26} />
			</div>
			<p className='ai-mode-pill'>{modes.includes('hosted') ? '内置 AI + 自定义模型' : '自定义模型'}</p>
			<h2>功能正在开发中</h2>
			<p>敬请期待</p>
		</section>
	);
}

/**
 * 生成当前站点下的注册邀请链接。
 */
function getRegisterInviteUrl(code: string): string {
	const path = `/register?code=${encodeURIComponent(code)}`;
	if (typeof window === 'undefined') {
		return path;
	}
	return new URL(path, window.location.origin).toString();
}

/**
 * 设置主体面板。
 */
function AdminPanel() {
	const [search, setSearch] = useState('');
	const [cursor, setCursor] = useState<string | undefined>();
	const users = useAdminUsers({ q: search.trim() || undefined, cursor, limit: 50 });
	const invites = useAdminInvites();
	const createInvite = useCreateAdminInvite();
	const updateInviteRegistration = useUpdateInviteRegistration();
	const updateMembership = useUpdateUserMembership();

	function handleSearchChange(value: string) {
		setSearch(value);
		setCursor(undefined);
	}

	function updateUserPlan(user: AdminUser) {
		updateMembership.mutate({
			id: user.id,
			plan: user.plan === 'member' ? 'free' : 'member',
			membershipExpiresAt: null,
		});
	}

	function toggleInviteRegistration() {
		const current = invites.data?.registrationEnabled ?? false;
		updateInviteRegistration.mutate({ registrationEnabled: !current });
	}

	async function copyInviteCode(code: string) {
		try {
			await navigator.clipboard.writeText(code);
			toast.success('邀请码已复制');
		} catch {
			toast.error('复制失败，请手动复制');
		}
	}

	async function copyInviteLink(code: string) {
		try {
			await navigator.clipboard.writeText(getRegisterInviteUrl(code));
			toast.success('邀请链接已复制');
		} catch {
			toast.error('复制失败，请手动复制');
		}
	}

	function renderInviteRow(code: AdminInviteCode) {
		const used = Boolean(code.usedByUserId);
		return (
			<div
				key={code.code}
				className='admin-invite-row'
			>
				<div className='admin-invite-main'>
					<strong>{code.code}</strong>
					<span>{used ? `使用于 ${formatDateTime(code.usedAt)}` : `创建于 ${formatDateTime(code.createdAt)}`}</span>
				</div>
				<span
					className='admin-invite-status'
					data-used={used ? 'true' : undefined}
				>
					{used ? '已使用' : '可使用'}
				</span>
				<Button
					type='button'
					variant='ghost'
					size='sm'
					disabled={used}
					onClick={() => void copyInviteCode(code.code)}
				>
					<Copy size={14} />
					复制
				</Button>
				<Button
					type='button'
					variant='ghost'
					size='sm'
					disabled={used}
					onClick={() => void copyInviteLink(code.code)}
				>
					<Copy size={14} />
					链接
				</Button>
			</div>
		);
	}

	return (
		<section className='admin-panel'>
			<div className='admin-invite-panel'>
				<div className='admin-invite-header'>
					<div>
						<p className='settings-label'>注册模式</p>
						<h2 className='settings-title'>注册入口</h2>
					</div>
					<span
						className='admin-invite-switch-state'
						data-enabled={invites.data?.registrationEnabled ? 'true' : undefined}
					>
						{invites.data?.registrationEnabled ? '邀请码模式' : '开放注册'}
					</span>
				</div>
				<div className='admin-invite-actions'>
					<Button
						type='button'
						variant={invites.data?.registrationEnabled ? 'ghost' : 'secondary'}
						disabled={updateInviteRegistration.isPending || invites.isLoading}
						onClick={toggleInviteRegistration}
					>
						{invites.data?.registrationEnabled ? '改为开放注册' : '开启邀请码模式'}
					</Button>
					<Button
						type='button'
						disabled={createInvite.isPending}
						onClick={() => createInvite.mutate()}
					>
						<KeyRound size={15} />
						{createInvite.isPending ? '生成中' : '生成邀请码'}
					</Button>
				</div>
				<div
					className='admin-invite-list'
					aria-busy={invites.isLoading}
				>
					{invites.isLoading && <div className='admin-row admin-row-muted'>正在加载邀请码</div>}
					{invites.isError && <div className='admin-row admin-row-muted'>邀请码加载失败</div>}
					{invites.data?.codes.length === 0 && <div className='admin-row admin-row-muted'>还没有邀请码</div>}
					{invites.data?.codes.map(renderInviteRow)}
				</div>
			</div>

			<div className='admin-toolbar'>
				<div>
					<p className='settings-label'>运营管理</p>
					<h2 className='settings-title'>用户会员</h2>
				</div>
				<div className='admin-search'>
					<Search size={15} />
					<Input
						value={search}
						onChange={(event) => handleSearchChange(event.target.value)}
						placeholder='搜索账号或昵称'
					/>
				</div>
			</div>

			<div
				className='admin-user-list'
				aria-busy={users.isLoading}
			>
				{users.isLoading && <div className='admin-row admin-row-muted'>正在加载用户</div>}
				{users.isError && <div className='admin-row admin-row-muted'>用户列表加载失败</div>}
				{users.data?.users.length === 0 && <div className='admin-row admin-row-muted'>没有匹配用户</div>}
				{users.data?.users.map((user) => (
					<div
						key={user.id}
						className='admin-user-row'
					>
						<div className='admin-user-main'>
							<div className='admin-user-title'>
								<strong>{user.nickname || user.account}</strong>
								<span data-plan={user.plan}>{user.plan === 'member' ? 'PRO' : 'FREE'}</span>
							</div>
							<span>{user.account}</span>
						</div>
						<div className='admin-user-meta'>{user.role === 'admin' && <span>管理员</span>}</div>
						<Button
							type='button'
							variant={user.plan === 'member' ? 'ghost' : 'secondary'}
							size='sm'
							disabled={updateMembership.isPending}
							onClick={() => updateUserPlan(user)}
						>
							{user.plan === 'member' ? '取消会员' : '设为会员'}
						</Button>
					</div>
				))}
			</div>

			{users.data?.nextCursor && (
				<div className='admin-footer'>
					<Button
						type='button'
						variant='ghost'
						size='sm'
						onClick={() => setCursor(users.data.nextCursor ?? undefined)}
					>
						下一页
					</Button>
				</div>
			)}
		</section>
	);
}

function ProfilePanel({
	account,
	nickname,
	nicknameDraft,
	nicknameDialogOpen,
	oldPassword,
	newPassword,
	confirmPassword,
	passwordDialogOpen,
	plan,
	createdAt,
	totalMemos,
	totalTags,
	activeDays,
	profileSubmitting,
	passwordSubmitting,
	onNicknameChange,
	onProfileSubmit,
	onOpenNicknameDialog,
	onCloseNicknameDialog,
	onOldPasswordChange,
	onNewPasswordChange,
	onConfirmPasswordChange,
	onPasswordSubmit,
	onOpenPasswordDialog,
	onClosePasswordDialog,
	onClose,
	onOpenSubscription,
}: ProfilePanelProps) {
	const displayNickname = nickname.trim() || '未设置昵称';

	return (
		<section
			className='profile-detail-panel'
			role='presentation'
			onMouseDown={onClose}
		>
			<div
				className='profile-detail-shell'
				role='dialog'
				aria-modal='true'
				aria-labelledby='profile-detail-title'
				onMouseDown={(event) => event.stopPropagation()}
			>
				<div className='profile-detail-header'>
					<h2 id='profile-detail-title'>账号详情</h2>
					<button
						type='button'
						className='profile-detail-close'
						aria-label='关闭'
						onClick={onClose}
					>
						<X size={17} />
					</button>
				</div>
				<div className='profile-detail-body'>
					<div className='profile-detail-group'>
						<p className='profile-detail-label'>基本信息</p>
						<div className='profile-detail-card profile-detail-summary'>
							<div className='profile-detail-main'>
								<div className='profile-detail-title'>
									<strong>{displayNickname}</strong>
									<span
										className='profile-detail-plan'
										data-plan={plan}
									>
										{plan === 'member' ? 'PRO' : 'FREE'}
									</span>
								</div>
							</div>
							<button
								type='button'
								className='profile-detail-edit-button'
								onClick={onOpenNicknameDialog}
							>
								修改
							</button>
						</div>
					</div>

					<div className='profile-detail-group'>
						<p className='profile-detail-label'>账号设置</p>
						<div className='profile-detail-card'>
							<div className='profile-detail-row'>
								<div>
									<strong>账号</strong>
									<span>{account}</span>
								</div>
							</div>
							<div className='profile-detail-row '>
								<div>
									<strong>密码</strong>
								</div>
								<button
									type='button'
									className='profile-detail-edit-button'
									onClick={onOpenPasswordDialog}
								>
									修改
								</button>
							</div>
						</div>
					</div>

					<div className='profile-detail-group'>
						<p className='profile-detail-label'>会员与数据</p>
						<div className='profile-detail-card'>
							<div className='profile-detail-row'>
								<div>
									<strong>当前订阅</strong>
								</div>
								<button
									type='button'
									className='profile-detail-edit-button'
									onClick={onOpenSubscription}
								>
									{plan === 'member' ? 'PRO' : 'FREE'}
								</button>
							</div>
							<div className='profile-detail-row'>
								<div>
									<strong>注册时间</strong>
								</div>
								<span>{formatProfileDate(createdAt)}</span>
							</div>
						</div>
					</div>
				</div>
			</div>
			{nicknameDialogOpen && (
				<div
					className='nickname-dialog-backdrop'
					role='presentation'
					onMouseDown={(event) => {
						event.stopPropagation();
						onCloseNicknameDialog();
					}}
				>
					<form
						className='nickname-dialog'
						role='dialog'
						aria-modal='true'
						aria-labelledby='nickname-dialog-title'
						onSubmit={onProfileSubmit}
						onMouseDown={(event) => event.stopPropagation()}
					>
						<div className='nickname-dialog-header'>
							<h3 id='nickname-dialog-title'>修改昵称</h3>
							<button
								type='button'
								className='nickname-dialog-close'
								aria-label='关闭'
								onClick={onCloseNicknameDialog}
							>
								<X size={18} />
							</button>
						</div>
						<Input
							value={nicknameDraft}
							onChange={(event) => onNicknameChange(event.target.value)}
							placeholder='设置昵称'
							maxLength={32}
							autoFocus
						/>
						<div className='nickname-dialog-actions'>
							<Button
								type='button'
								variant='ghost'
								className='nickname-dialog-cancel'
								onClick={onCloseNicknameDialog}
							>
								取消
							</Button>
							<Button
								type='submit'
								className='nickname-dialog-save'
								disabled={profileSubmitting}
							>
								{profileSubmitting ? '保存中' : '保存'}
							</Button>
						</div>
					</form>
				</div>
			)}
			{passwordDialogOpen && (
				<div
					className='password-dialog-backdrop'
					role='presentation'
					onMouseDown={(event) => {
						event.stopPropagation();
						onClosePasswordDialog();
					}}
				>
					<form
						className='password-dialog'
						role='dialog'
						aria-modal='true'
						aria-labelledby='password-dialog-title'
						onSubmit={onPasswordSubmit}
						onMouseDown={(event) => event.stopPropagation()}
					>
						<div className='password-dialog-header'>
							<h3 id='password-dialog-title'>修改密码</h3>
							<button
								type='button'
								className='password-dialog-close'
								aria-label='关闭'
								onClick={onClosePasswordDialog}
							>
								<X size={18} />
							</button>
						</div>
						<div className='password-dialog-fields'>
							<PasswordInput
								value={oldPassword}
								onChange={(event) => onOldPasswordChange(event.target.value)}
								placeholder='旧密码'
								autoComplete='current-password'
								autoFocus
							/>
							<PasswordInput
								value={newPassword}
								onChange={(event) => onNewPasswordChange(event.target.value)}
								placeholder='新密码（至少8位）'
								autoComplete='new-password'
								minLength={8}
							/>
							<PasswordInput
								value={confirmPassword}
								onChange={(event) => onConfirmPasswordChange(event.target.value)}
								placeholder='再次输入新密码'
								autoComplete='new-password'
								minLength={8}
							/>
						</div>
						<div className='password-dialog-footer'>
							<div className='password-dialog-actions'>
								<Button
									type='button'
									variant='ghost'
									className='password-dialog-cancel'
									onClick={onClosePasswordDialog}
								>
									取消
								</Button>
								<Button
									type='submit'
									className='password-dialog-confirm'
									disabled={passwordSubmitting || !oldPassword || !newPassword || !confirmPassword}
								>
									{passwordSubmitting ? '更新中' : '确定'}
								</Button>
							</div>
						</div>
					</form>
				</div>
			)}
		</section>
	);
}

function SettingsPanel() {
	return (
		<section className='settings-panel'>
			<div className='settings-empty-state'>
				<p>暂无设置，正在开发中</p>
			</div>
		</section>
	);
}

type SidebarButtonProps = {
	active?: boolean;
	icon?: ReactNode;
	children: ReactNode;
	onClick: () => void;
};

type TagSidebarItemProps = {
	tag: Tag;
	active?: boolean;
	menuOpen: boolean;
	menuItems: FloatingMenuItem[];
	onMenuOpenChange: (open: boolean) => void;
	onSelect: () => void;
};

type TagIconDialogProps = {
	tag: Tag;
	submitting: boolean;
	onClose: () => void;
	onSelectIcon: (icon: string | null) => void;
};

/**
 * 标签图标选择弹窗。
 */
function TagIconDialog({ tag, submitting, onClose, onSelectIcon }: TagIconDialogProps) {
	const currentIcon = getTagIconText(tag.icon);

	useEffect(() => {
		/**
		 * 按下 Esc 时关闭图标选择弹窗。
		 */
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				onClose();
			}
		}

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [onClose]);

	return (
		<motion.div
			className='dialog-backdrop'
			role='presentation'
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.14 }}
			onMouseDown={onClose}
		>
			<motion.section
				className='tag-icon-dialog'
				role='dialog'
				aria-modal='true'
				aria-labelledby='tag-icon-dialog-title'
				initial={{ opacity: 0, y: 12, scale: 0.98 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				exit={{ opacity: 0, y: 8, scale: 0.98 }}
				transition={{ duration: 0.16, ease: 'easeOut' }}
				onMouseDown={(event) => event.stopPropagation()}
			>
				<header className='tag-icon-dialog-header'>
					<div className='tag-icon-dialog-title-row'>
						<span className='tag-icon-dialog-preview'>
							{currentIcon ? (
								<span
									className='tag-icon-dialog-emoji'
									aria-hidden='true'
								>
									{currentIcon}
								</span>
							) : (
								<Hash size={24} />
							)}
						</span>
						<div className='min-w-0'>
							<h2 id='tag-icon-dialog-title'>更换图标</h2>
							<p>#{tag.name}</p>
						</div>
					</div>
					<button
						type='button'
						className='dialog-close-button'
						aria-label='关闭弹窗'
						title='关闭'
						onClick={onClose}
					>
						<X size={17} />
					</button>
				</header>
				<div className='tag-icon-dialog-toolbar'>
					<button
						type='button'
						className='tag-icon-default-button'
						data-selected={!tag.icon ? 'true' : undefined}
						disabled={submitting}
						onClick={() => onSelectIcon(null)}
					>
						<span>
							<Hash size={16} />
							默认
						</span>
						{!tag.icon && <Check size={15} />}
					</button>
				</div>
				<div className='tag-icon-picker-shell'>
					<Suspense fallback={<div className='tag-icon-picker-loading'>正在加载表情</div>}>
						<TagEmojiPicker onSelect={onSelectIcon} />
					</Suspense>
				</div>
			</motion.section>
		</motion.div>
	);
}

/**
 * 左侧栏标签项，包含标签筛选与更多操作。
 */
function TagSidebarItem({ tag, active, menuOpen, menuItems, onMenuOpenChange, onSelect }: TagSidebarItemProps) {
	return (
		<div
			className='tag-sidebar-item'
			data-active={active ? 'true' : undefined}
			data-menu-open={menuOpen ? 'true' : undefined}
		>
			<button
				type='button'
				className='tag-sidebar-select'
				onClick={onSelect}
			>
				<span className='tag-sidebar-icon'>
					<TagIcon
						icon={tag.icon}
						size={15}
					/>
				</span>
				<span className='tag-sidebar-name'>{tag.name}</span>
				<span className='tag-sidebar-count'>{tag.memoCount}</span>
			</button>
			<FloatingMenu
				open={menuOpen}
				items={menuItems}
				align='end'
				onOpenChange={onMenuOpenChange}
				className='tag-item-menu'
				trigger={({ open, toggle }) => (
					<button
						type='button'
						className='tag-item-menu-trigger'
						data-open={open ? 'true' : undefined}
						aria-label={`${tag.name} 更多操作`}
						aria-haspopup='menu'
						aria-expanded={open}
						title='更多操作'
						onClick={toggle}
					>
						<MoreHorizontal size={17} />
					</button>
				)}
			/>
		</div>
	);
}

/**
 * 左侧栏按钮。
 */
function SidebarButton({ active, icon, children, onClick }: SidebarButtonProps) {
	return (
		<button
			type='button'
			className='sidebar-button'
			data-active={active ? 'true' : undefined}
			onClick={onClick}
		>
			{icon}
			{children}
		</button>
	);
}
