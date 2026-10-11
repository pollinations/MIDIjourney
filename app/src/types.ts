export type Note = {
	pitch: number;
	start_time: number;
	duration: number;
	velocity: number;
};
export type CallEntry = {
	id: number;
	responseId?: string | null;
	startedAt: string;
	requestedModel: string | null;
	model: string | null;
	status: string;
	durationMs: number;
	messageCount: number;
	finishReason: string | null;
	reply?: { text: string | null; status: string };
	usage: {
		input: number | null;
		output: number | null;
		total: number | null;
		cached: number | null;
		reasoning: number | null;
	};
	error?: {
		code: string | null;
		httpStatus: number | null;
		requestId?: string | null;
		message?: string;
	};
	output?: {
		validation: string;
		title?: string | null;
		key?: string | null;
		duration?: number;
		noteCount?: number;
		pitchRange?: number[] | null;
		notes?: Note[];
		omittedNotes?: number;
	};
};
export type HistoryEntry = {
	role: "user" | "assistant";
	content: string;
	contextContent: string;
};
export type MidiResult = {
	title: string;
	explanation: string;
	key: string | null;
	duration: number;
	notes: Note[];
};
export type ChatTurn = {
	id: string;
	prompt: string;
	status: "pending" | "complete" | "failed" | "canceled";
	result?: MidiResult;
	text?: string;
	midiWarning?: string;
	calls: CallEntry[];
	basedOn?: string;
	sourceTarget?: string;
	input?: MidiInputSummary;
	inputs?: MidiInputSummary[];
	error?: string;
	notice?: string;
	writeError?: string;
};
export type MidiInputSummary = {
	kind: "live" | "reply" | "none";
	title: string;
	noteCount: number;
};
export type MidiAttachment = {
	key: string;
	summary: MidiInputSummary;
	source: { title: string; duration: number; notes: Note[] };
};
export type ChatState = {
	draft: string;
	turns: ChatTurn[];
	context: HistoryEntry[];
	busyId: string | null;
	sendingId: string | null;
};
export type LiveContext = {
	connected: boolean;
	checking?: boolean;
	target?: string;
	destination?: string;
	sourceId?: string;
	source?: { title: string; duration: number; notes: Note[] } | null;
	sourceError?: string;
	error?: string;
};
