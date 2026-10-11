import {
	Alert,
	ArrowRightIcon,
	Button,
	ColorModeToggle,
	Field,
	Heading,
	PlusIcon,
	ScrollArea,
	Surface,
	Text,
	Textarea,
	Tooltip,
} from "@pollinations/ui";
import { Markdown } from "@pollinations/ui/markdown";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { MessageMidiInput, MidiInputFeedback } from "./MidiInputFeedback";
import { midiInputsFeedback } from "./midi-input.mjs";
import { PianoRoll } from "./PianoRoll";
import { ReplyFooter } from "./ReplyFooter";
import { clipCreationUnavailable } from "./reply-presentation.mjs";
import type { ChatState, LiveContext, MidiAttachment } from "./types";

type Props = {
	account: ReactNode;
	notice?: ReactNode;
	chat: ChatState;
	live: LiveContext;
	loggedIn: boolean;
	connecting?: boolean;
	onPrompt: (text: string) => void;
	onGenerate: () => void;
	onCancel: () => void;
	onNewChat: () => void;
	onSend: (id: string) => void;
};
export function Workspace({
	account,
	notice,
	chat,
	live,
	loggedIn,
	connecting = false,
	onPrompt,
	onGenerate,
	onCancel,
	onNewChat,
	onSend,
}: Props) {
	const scroll = useRef<HTMLDivElement>(null);
	const follow = useRef(true);
	const composer = useRef<HTMLTextAreaElement>(null);
	function changePrompt(value: string) {
		onPrompt(value);
	}
	const last = chat.turns.at(-1);
	const creationUnavailable = clipCreationUnavailable(live);
	const input = useMemo(() => midiInputsFeedback(live), [live]) as {
		items: MidiAttachment[];
		error?: string;
		checking?: boolean;
	};
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
			className="mj-send"
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
		follow.current = true;
		onNewChat();
		composer.current?.focus();
	}
	return (
		<>
			<header className="mj-app-width mj-header mx-auto z-30 flex w-full shrink-0 items-center justify-between gap-2 px-5 py-3">
				<Button
					size="sm"
					type="button"
					className="mj-new-chat shrink-0"
					onClick={fresh}
					disabled={Boolean(chat.sendingId)}
				>
					<PlusIcon aria-hidden="true" className="h-3 w-3" />
					New chat
				</Button>
				<div className="mj-header-controls ml-auto flex min-w-0 items-center justify-end gap-1.5">
					<div className="mj-header-account">{account}</div>
					<ColorModeToggle />
				</div>
			</header>
			<main className="mj-app-width mx-auto flex min-h-0 w-full min-w-0 flex-1 flex-col">
				<Surface
					role="region"
					variant="panel"
					className="mj-chat-panel mj-scroll polli-scrollbar-subtle"
					data-scrollbar-active="true"
					aria-label="Musical conversation"
				>
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
							aria-label="Welcome from Midi Journey 2"
						>
							<Text size="sm">🎹 Hi, I’m Midi Journey 2.</Text>
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
										<strong>Create clip</strong> fills an empty slot or replaces
										the selected clip.
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
										<Alert
											intent={turn.status === "canceled" ? "warning" : "danger"}
										>
											{turn.error}
										</Alert>
									) : null}
									{turn.text ? (
										<Markdown className="mj-chat-text">{turn.text}</Markdown>
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
											<PianoRoll clip={turn.result} />
										</>
									) : null}
									<ReplyFooter
										turn={turn}
										replyNumber={index + 1}
										sending={chat.sendingId === turn.id}
										unavailableReason={creationUnavailable}
										disabled={Boolean(chat.busyId || chat.sendingId)}
										onSend={() => onSend(turn.id)}
									/>
								</Surface>
							</article>
						))}
					</ScrollArea>

					<form
						className="shrink-0 space-y-2"
						onSubmit={(event) => {
							event.preventDefault();
							submit();
						}}
					>
						{notice ? (
							<div className="mj-app-width w-full shrink-0" role="alert">
								{notice}
							</div>
						) : null}
						<Field.Root className="mj-composer flex min-w-0 flex-col">
							<MidiInputFeedback {...input} />
							<Field.Label htmlFor="chat-message" className="sr-only">
								<Text as="span" size="xs" tone="muted">
									Message
								</Text>
							</Field.Label>
							<Textarea
								ref={composer}
								id="chat-message"
								value={chat.draft}
								onChange={(event) => changePrompt(event.target.value)}
								className="mj-prompt mj-scroll polli-scrollbar-subtle polli:min-w-0 polli:text-sm polli:leading-relaxed"
								data-scrollbar-active="true"
								rows={2}
								maxLength={12000}
								required
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
							<div className="mj-composer-action">
								{chat.busyId ? (
									<Button size="md" type="button" onClick={onCancel}>
										Cancel
									</Button>
								) : !loggedIn ? (
									<Tooltip
										triggerAs="span"
										tapEnabled
										ariaLabel="Why Send is unavailable"
										content={
											connecting
												? "Finish connecting in your browser."
												: "Connect to Pollinations first."
										}
									>
										{sendButton}
									</Tooltip>
								) : (
									sendButton
								)}
							</div>
						</Field.Root>
					</form>
				</Surface>
			</main>
		</>
	);
}
