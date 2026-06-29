import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import type { EmojiClickData } from 'emoji-picker-react';
import zhEmojiData from 'emoji-picker-react/dist/data/emojis-zh';

type TagEmojiPickerProps = {
	className?: string;
	height?: number;
	onSelect: (emoji: string) => void;
};

/**
 * 标签图标 emoji 选择器，单独拆包避免拖慢首屏。
 */
export function TagEmojiPicker({ className = 'tag-icon-picker', height = 360, onSelect }: TagEmojiPickerProps) {
	function handleEmojiClick(emojiData: EmojiClickData) {
		onSelect(emojiData.emoji);
	}

	return (
		<EmojiPicker
			className={className}
			width='100%'
			height={height}
			emojiStyle={EmojiStyle.NATIVE}
			theme={Theme.LIGHT}
			emojiData={zhEmojiData}
			lazyLoadEmojis
			searchPlaceholder='搜索 emoji'
			searchClearButtonLabel='清空搜索'
			previewConfig={{ showPreview: false }}
			onEmojiClick={handleEmojiClick}
		/>
	);
}
