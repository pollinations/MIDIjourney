import {
	Alert,
	ArrowRightIcon,
	Button,
	Field,
	Heading,
	ScrollArea,
	Surface,
	Text,
	Textarea,
	TrashIcon,
	XIcon,
} from "@pollinations/ui";
import { Markdown } from "@pollinations/ui/markdown";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { CompactInputStatus, CompactMidi } from "./CompactMidi";
import { MidiClipButton } from "./MidiClipButton";
import { MessageMidiInput } from "./MidiInputFeedback";
import { midiInputsFeedback } from "./midi-input.mjs";
import {
	clipCreationUnavailable,
	clipWriteAction,
	clipWriteFeedback,
} from "./reply-presentation.mjs";
import type { ChatState, LiveContext, MidiAttachment } from "./types";
import { useCompactLayout } from "./useCompactLayout";

type Props = {
	notice?: ReactNode;
	chat: ChatState;
	live: LiveContext;
	loggedIn: boolean;
	accountControl: ReactNode;
	connectControl: ReactNode;
	onPrompt: (text: string) => void;
	onGenerate: () => void;
	onCancel: () => void;
	onNewChat: () => void;
	onSend: (id: string) => void;
};
export function Workspace({
	notice,
	chat,
	live,
	loggedIn,
	accountControl,
	connectControl,
	onPrompt,
	onGenerate,
	onCancel,
	onNewChat,
	onSend,
}: Props) {
	const scroll = useRef<HTMLDivElement>(null);
	const follow = useRef(true);
	const composer = useRef<HTMLTextAreaElement>(null);
	const compact = useCompactLayout();
	function changePrompt(value: string) {
		onPrompt(value);
	}
	const last = chat.turns.at(-1);
	const midiTurn = [...chat.turns].reverse().find((turn) => turn.result);
	const midiCount = chat.turns.filter(
		(turn) => turn.result?.notes.length,
	).length;
	const canReset = loggedIn && midiCount > 0;
	const creationUnavailable = clipCreationUnavailable(live);
	const writeAction = clipWriteAction(live);
	const input = useMemo(() => midiInputsFeedback(live), [live]) as {
		items: MidiAttachment[];
		error?: string;
		checking?: boolean;
	};
	const compactNotice =
		notice ||
		input.error ||
		(last?.status !== "canceled" && last?.error) ||
		last?.midiWarning ||
		(midiTurn?.writeError ? clipWriteFeedback(midiTurn.writeError) : null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: These content changes trigger scrolling after React updates the conversation DOM.
	useEffect(() => {
		if (follow.current && scroll.current)
			scroll.current.scrollTop = scroll.current.scrollHeight;
	}, [
		chat.turns.length,
		last?.status,
		last?.inputs,
		last?.notice,
		last?.writeError,
		compact,
	]);
	function submit() {
		if (
			!loggedIn ||
			!chat.draft.trim() ||
			chat.busyId ||
			chat.sendingId ||
			input.error ||
			input.checking
		)
			return;
		follow.current = true;
		onGenerate();
	}
	const sendButton = (
		<Button
			size="md"
			type="submit"
			aria-label="Send"
			className="mj-round mj-send"
			disabled={
				!loggedIn ||
				!chat.draft.trim() ||
				Boolean(chat.sendingId || input.error || input.checking)
			}
		>
			<ArrowRightIcon aria-hidden="true" className="h-5 w-5" />
		</Button>
	);
	function fresh() {
		if (!canReset) return;
		follow.current = true;
		onNewChat();
		composer.current?.focus();
	}
	return (
		<main
			className="mj-app-width mj-workspace mx-auto flex min-h-0 w-full min-w-0 flex-1 flex-col"
			data-compact={compact}
		>
			<Surface
				role="region"
				variant="panel"
				className="mj-chat-panel mj-scroll polli-scrollbar-subtle"
				data-scrollbar-active="true"
				aria-label="Musical conversation"
			>
				{compact ? (
					<CompactMidi busy={Boolean(chat.busyId)}>
						{midiTurn?.result ? (
							<MidiClipButton
								clip={midiTurn.result}
								compact
								sending={chat.sendingId === midiTurn.id}
								disabled={Boolean(chat.busyId || chat.sendingId)}
								actionLabel={writeAction}
								unavailableReason={creationUnavailable}
								onWrite={() => onSend(midiTurn.id)}
							/>
						) : null}
					</CompactMidi>
				) : (
					<ScrollArea
						ref={scroll}
						role="region"
						aria-label="Conversation"
						tabIndex={0}
						className="mj-scroll min-h-0 flex-1 space-y-3 pb-2"
						onScroll={(event) => {
							const el = event.currentTarget;
							follow.current =
								el.scrollHeight - el.scrollTop - el.clientHeight < 80;
						}}
					>
						{/* Always the first bubble, including after the first exchange. */}
						<Surface
							variant="card"
							className="mj-assistant-reply mr-6 p-3 space-y-2"
							aria-label="MIDI generation introduction"
						>
							<Heading size="card" className="mj-reply-title">
								Generative MIDI clips
							</Heading>
							<ul className="list-disc space-y-1 pl-4">
								<li>
									<Text size="sm">
										<strong>Describe</strong> an idea, then ask for changes.
									</Text>
								</li>
								<li>
									<Text size="sm">
										<strong>Select a Live clip</strong> to use its MIDI as
										input.
									</Text>
								</li>
								<li>
									<Text size="sm">
										<strong>Click a MIDI preview</strong> to write it to the
										selected slot or replace the selected clip.
									</Text>
								</li>
							</ul>
						</Surface>

						{chat.turns.map((turn, index) => (
							<article
								key={turn.id}
								aria-label={`Exchange ${index + 1}`}
								className="space-y-2"
							>
								<Surface
									variant="card-themed"
									className="mj-user-message polli:bg-theme-bg-active polli:text-theme-text-strong ml-auto w-fit max-w-[88%] px-3 py-2"
									aria-label="Your message"
								>
									{turn.inputs?.length ||
									(turn.input?.kind && turn.input.kind !== "none") ? (
										<MessageMidiInput
											inputs={turn.inputs || (turn.input ? [turn.input] : [])}
										/>
									) : null}
									<Text size="sm" className="whitespace-pre-wrap break-words">
										{turn.prompt}
									</Text>
								</Surface>
								{turn.status !== "canceled" && (
									<Surface
										variant="card"
										className="mj-assistant-reply mr-6 p-3 space-y-2"
										aria-label="Assistant reply"
									>
										{turn.status === "pending" ? (
											<Text
												size="sm"
												role="status"
												className="flex items-center gap-2"
											>
												<span className="mj-thinking-dots" aria-hidden="true">
													<span />
													<span />
													<span />
												</span>
												Thinking…
											</Text>
										) : null}
										{turn.error ? (
											<Alert intent="danger">{turn.error}</Alert>
										) : null}
										{turn.text ? (
											<Markdown className="mj-chat-text">{turn.text}</Markdown>
										) : null}
										{turn.writeError ? (
											<Alert intent="danger">
												{clipWriteFeedback(turn.writeError)}
											</Alert>
										) : null}
										{turn.midiWarning ? (
											<Alert intent="warning">{turn.midiWarning}</Alert>
										) : null}
										{turn.result ? (
											<>
												<Heading size="card" className="mj-reply-title">
													{turn.result.title}
												</Heading>
												<Text
													size="sm"
													className="mj-reply-explanation whitespace-pre-wrap break-words"
												>
													{turn.result.explanation}
												</Text>
												<MidiClipButton
													clip={turn.result}
													sending={chat.sendingId === turn.id}
													disabled={Boolean(chat.busyId || chat.sendingId)}
													actionLabel={writeAction}
													unavailableReason={creationUnavailable}
													onWrite={() => onSend(turn.id)}
												/>
											</>
										) : null}
									</Surface>
								)}
							</article>
						))}
					</ScrollArea>
				)}

				<form
					className="mj-composer-form flex shrink-0 flex-col gap-2"
					noValidate
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					{(compact ? compactNotice : notice || input.error) ? (
						<div
							className="mj-app-width mj-composer-notice w-full shrink-0"
							role="alert"
						>
							{compact ? compactNotice : notice || input.error}
						</div>
					) : null}
					<div className="mj-composer-toolbar">
						{accountControl}
						{/* Keep login mounted through the final handoff acknowledgement. */}
						{connectControl}

						{(loggedIn || input.items.length > 0) && (
							<CompactInputStatus {...input} />
						)}

						{loggedIn && chat.busyId ? (
							<Button
								size="md"
								type="button"
								className="mj-round"
								aria-label="Cancel generation"
								onClick={onCancel}
							>
								<XIcon aria-hidden="true" className="h-5 w-5" />
							</Button>
						) : (
							sendButton
						)}
						<Button
							size="md"
							type="button"
							className={`mj-round mj-quiet${midiCount ? " mj-reset" : ""}`}
							intent="neutral"
							aria-label="Reset conversation"
							aria-description={`Clear chat history with ${midiCount} generated MIDI clips.`}
							onClick={fresh}
							disabled={!canReset}
						>
							<TrashIcon aria-hidden="true" className="h-5 w-5" />
							{midiCount > 0 && (
								<span className="mj-reset-count" aria-hidden="true">
									{midiCount}
								</span>
							)}
						</Button>
					</div>
					<Field.Root className="mj-composer flex min-w-0 flex-col">
						<Field.Label htmlFor="chat-message" className="sr-only">
							<Text as="span" size="xs" tone="muted">
								Message
							</Text>
						</Field.Label>
						<Textarea
							ref={(node) => {
								composer.current = node;
							}}
							id="chat-message"
							value={chat.draft}
							onChange={(event) => changePrompt(event.target.value)}
							className="mj-prompt mj-scroll polli-scrollbar-subtle polli:min-w-0 polli:text-sm polli:leading-relaxed"
							data-scrollbar-active="true"
							rows={compact ? 3 : 6}
							maxLength={12000}
							onKeyDown={(event) => {
								if (
									event.key === "Enter" &&
									!event.shiftKey &&
									!event.nativeEvent.isComposing
								) {
									event.preventDefault();
									if (
										loggedIn &&
										!chat.busyId &&
										!chat.sendingId &&
										chat.draft.trim()
									)
										submit();
								}
							}}
						/>
					</Field.Root>
				</form>
			</Surface>
		</main>
	);
}
