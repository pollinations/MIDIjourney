// Deliberately small, ES5-compatible Max LiveAPI bridge. No authentication,
// network access, arbitrary paths or eval. All mutations enter through create().
autowatch = 0;
inlets = 1;
outlets = 2;
var enabled = false;
var writing = false;
var cacheKey = "";
var sourceCache = null;
var completed = {};
var completedIds = [];
var tasks = [];
var mirrored = "";
var incoming = null;

function api(path) {
	return new LiveAPI(null, path);
}
function byId(id) {
	return api("id " + id);
}
function scalar(object, property) {
	var result = object.get(property);
	return result instanceof Array ? result[0] : result;
}
function identifier(value) {
	if (value instanceof Array)
		return Number(value[0] === "id" ? value[1] : value[0]) || 0;
	return Number(value) || 0;
}
function child(object, property) {
	return identifier(object.get(property));
}
function ids(object, property) {
	var value = object.get(property),
		output = [];
	for (var i = 0; i < value.length; i++) {
		if (value[i] === "id" && Number(value[i + 1]))
			output.push(Number(value[++i]));
	}
	return output;
}
function objectName(object) {
	var value = object.get("name");
	return String(value instanceof Array ? value.join(" ") : value).slice(0, 240);
}
function later(fn, delay) {
	var task = new Task(function () {
		var index = tasks.indexOf(task);
		if (index >= 0) tasks.splice(index, 1);
		fn();
	}, this);
	tasks.push(task);
	task.schedule(delay || 0);
}
// Max symbols stop at 32767 characters. Keep each wire atom well below that
// limit, including UTF-8 expansion. Reassemble before parsing or mutating Live.
function respond(id, value) {
	var raw = JSON.stringify(value).replace(/[\u007f-\uffff]/g, function (c) {
		return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
	});
	if (raw.length <= 4096) {
		outlet(0, "response", String(id), raw);
		return;
	}
	var total = Math.ceil(raw.length / 4096);
	if (total > 2048) {
		outlet(
			0,
			"response",
			String(id),
			JSON.stringify({
				ok: false,
				error: "The selected MIDI clip is too large to transfer."
			})
		);
		return;
	}
	for (var i = 0; i < total; i++)
		outlet(
			0,
			"responsepart",
			String(id),
			i,
			total,
			raw.slice(i * 4096, (i + 1) * 4096)
		);
}
function createpart(id, index, total, text) {
	if (!validRequestId(id)) return;
	if (index === 0 && !incoming) {
		incoming = { id: id, total: total, parts: [], length: 0 };
		var current = incoming;
		later(function () {
			if (incoming === current) incoming = null;
		}, 10000);
	}
	if (!incoming || incoming.id !== id) {
		respond(id, {
			ok: false,
			error: "Another MIDI transfer is pending. Wait before trying again."
		});
		return;
	}
	if (
		typeof total !== "number" ||
		total !== Math.floor(total) ||
		total < 1 ||
		total > 245 ||
		total !== incoming.total ||
		index !== incoming.parts.length ||
		index >= total ||
		typeof text !== "string" ||
		text.length > 4096 ||
		incoming.length + text.length > 1000000
	) {
		incoming = null;
		respond(id, {
			ok: false,
			error: "The MIDI transfer was incomplete. No changes made."
		});
		return;
	}
	incoming.parts.push(text);
	incoming.length += text.length;
	if (incoming.parts.length === total) {
		var raw = incoming.parts.join("");
		incoming = null;
		create(id, raw);
	}
}
function init() {
	enabled = true;
}
function dashboard() {
	outlet(1, "dashboard");
}
// Dispatch only explicit operations; ignore browser navigation notifications.
function list() {
	var values = arrayfromargs(arguments);
	if (values[0] === "context") context(values[1], values[2]);
	else if (values[0] === "create") create(values[1], values[2]);
	else if (values[0] === "createpart")
		createpart(values[1], values[2], values[3], values[4]);
	else if (values[0] === "dashboard") dashboard();
}
function anything() {}
function validRequestId(id) {
	return typeof id === "string" && /^[a-z0-9-]{1,80}$/.test(id);
}
function dictionaryResult(result) {
	if (result instanceof Array && result[0] === "dictionary") {
		var dictionary = new Dict(result[1]);
		try {
			return JSON.parse(dictionary.stringify());
		} finally {
			dictionary.freepeer();
		}
	}
	if (typeof result === "string") return JSON.parse(result);
	throw new Error("Live did not return MIDI notes.");
}
// Session input follows the highlighted slot, not a stale Detail View clip.
// Arrangement keeps the original detail_clip source. The public Live API does
// not expose the complete multi-clip selection; never infer or retain extra clips.
// Note extraction remains identical to mj_clipImport (get_all_notes_extended).
function selectedSource(view, fresh) {
	var documentView = String(
		scalar(api("live_app view"), "focused_document_view")
	);
	var sourceId = 0;
	if (documentView === "Session") {
		var slotId = child(view, "highlighted_clip_slot");
		var trackId = child(view, "selected_track");
		if (slotId && trackId && Number(scalar(byId(trackId), "has_midi_input"))) {
			var slot = byId(slotId);
			if (
				child(slot, "canonical_parent") === trackId &&
				Number(scalar(slot, "has_clip"))
			)
				sourceId = child(slot, "clip");
		}
	} else if (documentView === "Arranger") {
		sourceId = child(view, "detail_clip");
	} else {
		throw new Error("Could not determine Live's selected view.");
	}
	if (fresh || String(sourceId) !== cacheKey) {
		sourceCache = null;
		cacheKey = "";
		if (sourceId) {
			var clip = byId(sourceId);
			if (Number(scalar(clip, "is_midi_clip"))) {
				var raw = dictionaryResult(clip.call("get_all_notes_extended"));
				if (!(raw.notes instanceof Array))
					throw new Error(
						"Live did not return the selected clip's MIDI notes."
					);
				// Keep mute and fractional velocity for the original shared sanitizer.
				// Do not impose a second read range or note limit before buildRequest.
				sourceCache = {
					title: objectName(clip),
					duration: Number(scalar(clip, "length")),
					notes: raw.notes.map(function (n) {
						return {
							pitch: n.pitch,
							start_time: n.start_time,
							duration: n.duration,
							velocity: n.velocity,
							mute: n.mute
						};
					})
				};
			}
		}
		cacheKey = String(sourceId);
	}
	return { sourceId: sourceCache ? String(sourceId) : "", source: sourceCache };
}
function destination(view) {
	// Never replace a hidden Session clip while an Arrangement clip is selected.
	if (
		String(scalar(api("live_app view"), "focused_document_view")) !== "Session"
	)
		throw new Error("Select a MIDI clip or empty slot in Session View.");
	var trackId = child(view, "selected_track");
	if (!trackId) throw new Error("Select a MIDI track and clip slot in Live.");
	var track = byId(trackId);
	if (!Number(scalar(track, "has_midi_input")))
		throw new Error("Select a MIDI clip or empty slot on a MIDI track.");
	var slotId = child(view, "highlighted_clip_slot");
	if (!slotId) throw new Error("Select a MIDI clip slot in Session View.");
	var slot = byId(slotId);
	if (child(slot, "canonical_parent") !== trackId)
		throw new Error("Select a clip slot on the highlighted MIDI track.");
	var slots = ids(track, "clip_slots");
	if (slots.indexOf(slotId) < 0)
		throw new Error("The selected clip slot is no longer on this track.");
	var occupied = Number(scalar(slot, "has_clip"));
	var clipId = occupied ? child(slot, "clip") : 0;
	if (occupied) {
		if (!clipId)
			throw new Error("Live has not exposed the selected clip identity.");
		assertWritableClip(byId(clipId));
	}
	var signature = trackId + ":" + slotId + ":" + clipId + ":" + slotId;
	return {
		connected: true,
		target: signature,
		slotId: slotId,
		trackId: trackId,
		clipId: clipId,
		destination:
			objectName(track) +
			(clipId ? " · clip " : " · empty slot ") +
			(slots.indexOf(slotId) + 1)
	};
}
function assertWritableClip(clip) {
	if (!Number(scalar(clip, "is_midi_clip")))
		throw new Error("Select a MIDI clip, not an audio clip.");
	if (
		Number(scalar(clip, "is_recording")) ||
		Number(scalar(clip, "is_overdubbing"))
	)
		throw new Error(
			"Stop recording into the selected clip before replacing it."
		);
}
function allNotes(clip) {
	var notes = dictionaryResult(clip.call("get_all_notes_extended")).notes;
	if (!(notes instanceof Array))
		throw new Error("Live did not return all MIDI notes.");
	return notes;
}
function removalRange(notes, duration) {
	// Include negative pickups and notes outside the loop / generated duration.
	// remove_notes_extended selects notes by start time, not their end time.
	// https://docs.cycling74.com/apiref/lom/clip/#remove_notes_extended
	var from = 0,
		end = duration;
	for (var i = 0; i < notes.length; i++) {
		if (
			!finite(notes[i].start_time) ||
			!finite(notes[i].pitch) ||
			notes[i].pitch % 1 ||
			notes[i].pitch < 0 ||
			notes[i].pitch > 127
		)
			throw new Error(
				"Live returned unreadable existing notes. No notes replaced."
			);
		from = Math.min(from, notes[i].start_time);
		end = Math.max(end, notes[i].start_time + 1);
	}
	if (!finite(end - from) || end - from <= 0)
		throw new Error("Invalid existing MIDI range.");
	return { from: from, span: end - from };
}
function setRegion(clip, start, end, duration) {
	// Move start left first: either a shorter result or an old negative region
	// can otherwise make Live reject an end-before-start marker change.
	clip.set(start, Math.min(0, Number(scalar(clip, start))));
	clip.set(end, duration);
	clip.set(start, 0);
}
function selected(fresh) {
	if (!enabled)
		throw new Error(
			"The connector is starting. Keep this device loaded in Live."
		);
	var view = api("live_set view"),
		value;
	try {
		value = destination(view);
	} catch (failure) {
		value = { connected: false, error: failure.message };
	}
	try {
		var input = selectedSource(view, fresh);
		value.sourceId = input.sourceId;
		value.source = input.source;
	} catch (failure) {
		value.source = null;
		value.sourceError =
			"Could not read the selected MIDI clip. " + failure.message;
	}
	return value;
}
function context(id, fresh) {
	if (!validRequestId(id)) return;
	var value;
	try {
		value = selected(Boolean(fresh));
	} catch (failure) {
		value = {
			connected: false,
			error: failure.message,
			sourceError: "Could not read Live's MIDI input. " + failure.message
		};
	}
	var status = JSON.stringify({
		connected: value.connected,
		destination: value.destination,
		error: value.error
	});
	if (status !== mirrored) {
		mirrored = status;
		outlet(1, "context", status);
	}
	respond(id, { ok: true, context: value });
}
function finite(value) {
	return typeof value === "number" && isFinite(value);
}
function validate(value) {
	if (
		!value ||
		typeof value.title !== "string" ||
		!value.title.trim() ||
		value.title.length > 60 ||
		!finite(value.duration) ||
		value.duration <= 0 ||
		value.duration > 4096 ||
		!(value.notes instanceof Array) ||
		!value.notes.length ||
		value.notes.length > 2048
	)
		throw new Error("Invalid MIDI clip. No changes made.");
	return {
		title: value.title.replace(/[\r\n\u0000]/g, " "),
		duration: value.duration,
		notes: value.notes.map(function (n) {
			if (
				!finite(n.pitch) ||
				n.pitch % 1 ||
				n.pitch < 0 ||
				n.pitch > 127 ||
				!finite(n.velocity) ||
				n.velocity % 1 ||
				n.velocity < 1 ||
				n.velocity > 127 ||
				!finite(n.start_time) ||
				n.start_time < 0 ||
				!finite(n.duration) ||
				n.duration <= 0 ||
				n.start_time + n.duration > value.duration + 0.0001
			)
				throw new Error("Invalid MIDI note. No changes made.");
			return {
				pitch: n.pitch,
				velocity: n.velocity,
				start_time: n.start_time,
				duration: n.duration,
				mute: 0
			};
		})
	};
}
function remember(id, value) {
	completed[id] = value;
	completedIds.push(id);
	if (completedIds.length > 64) delete completed[completedIds.shift()];
	respond(id, value);
}
function create(id, raw) {
	if (!validRequestId(id)) return;
	if (completed[id]) {
		respond(id, completed[id]);
		return;
	}
	if (writing) {
		respond(id, {
			ok: false,
			error: "A clip write is already in progress. Wait for confirmation."
		});
		return;
	}
	var clip, target;
	try {
		if (typeof raw !== "string" || raw.length > 1000000)
			throw new Error("Invalid MIDI request.");
		var request = JSON.parse(raw);
		clip = validate(request.clip);
		if (!enabled)
			throw new Error(
				"The connector is starting. Keep this device loaded in Live."
			);
		target = destination(api("live_set view"));
		if (request.target !== target.target)
			throw new Error(
				"The selection changed. Check the destination and click Create clip again."
			);
		// Revalidate both occupancy and identity before the first mutation.
		var slot = byId(target.slotId);
		if (
			Number(scalar(slot, "has_clip")) !== (target.clipId ? 1 : 0) ||
			child(slot, "clip") !== target.clipId
		)
			throw new Error("The destination changed. No changes made.");
	} catch (failure) {
		respond(id, { ok: false, error: failure.message });
		return;
	}
	writing = true;
	// Mark in-flight so a replay can never create twice, even after a timeout.
	completed[id] = {
		ok: false,
		error:
			"This request is already being processed. Check Live before retrying."
	};
	var createdId = target.clipId,
		writeDictionary = null;
	function finish(value) {
		if (writeDictionary) {
			writeDictionary.freepeer();
			writeDictionary = null;
		}
		if (!value.ok) post("MIDI Journey: " + value.error + "\n");
		writing = false;
		cacheKey = "";
		remember(id, value);
	}
	try {
		// Prepare the payload before creating a clip or clearing any existing notes.
		writeDictionary = new Dict();
		writeDictionary.parse(JSON.stringify({ notes: clip.notes }));
		if (!createdId) {
			byId(target.slotId).call("create_clip", clip.duration);
			createdId = child(byId(target.slotId), "clip");
		}
		if (!createdId)
			throw new Error("Live has not exposed the created clip identity.");
	} catch (_) {
		finish({
			ok: false,
			error:
				"Live could not create the clip. Check the destination before retrying."
		});
		return;
	}
	// Create/replace and fill on one invocation; never guess a later clip's ID.
	// Max's Live Object Model has no begin/end_undo_step functions.
	function fill() {
		try {
			var slot = byId(target.slotId);
			if (child(slot, "canonical_parent") !== target.trackId)
				throw new Error("Destination moved.");
			if (child(slot, "clip") !== createdId)
				throw new Error("Destination changed.");
			var created = byId(createdId);
			assertWritableClip(created);
			var existing = allNotes(created);
			if (!target.clipId && existing.length)
				throw new Error("The new clip is no longer empty.");
			var range = removalRange(existing, clip.duration);
			var markers = ["loop_start", "loop_end", "start_marker", "end_marker"];
			for (var marker = 0; marker < markers.length; marker++)
				if (!finite(Number(scalar(created, markers[marker]))))
					throw new Error("Live returned unreadable clip markers.");
			if (existing.length) {
				created.call("remove_notes_extended", 0, 128, range.from, range.span);
				if (allNotes(created).length)
					throw new Error("Live did not clear the existing notes.");
			}
			// JS LiveAPI accepts the Dict object, unlike live.object's message syntax.
			// Retain its native peer until read-back has completed.
			created.call("add_new_notes", writeDictionary);
			setRegion(created, "loop_start", "loop_end", clip.duration);
			setRegion(created, "start_marker", "end_marker", clip.duration);
			created.set("name", clip.title);
			later(verify, 100);
		} catch (failure) {
			finish({
				ok: false,
				error:
					"Live could not write the clip. " +
					failure.message +
					" Inspect it and use Undo if needed; no write was retried."
			});
		}
	}
	var checks = 0;
	function verify() {
		try {
			if (
				child(byId(target.slotId), "canonical_parent") !== target.trackId ||
				child(byId(target.slotId), "clip") !== createdId
			)
				throw new Error("Destination clip changed.");
			var created = byId(createdId);
			function compare(a, b) {
				return (
					a.start_time - b.start_time ||
					a.pitch - b.pitch ||
					a.duration - b.duration
				);
			}
			var actual = allNotes(created).slice().sort(compare),
				expected = clip.notes.slice().sort(compare);
			var problem =
				actual.length !== expected.length
					? "Expected " +
						expected.length +
						" notes; Live returned " +
						actual.length +
						"."
					: objectName(created) !== clip.title
						? "The clip title did not match."
						: Math.abs(Number(scalar(created, "length")) - clip.duration) >
								0.0001
							? "The clip length did not match."
							: Number(scalar(created, "start_marker")) !== 0 ||
									Number(scalar(created, "loop_start")) !== 0 ||
									Math.abs(
										Number(scalar(created, "end_marker")) - clip.duration
									) > 0.0001 ||
									Math.abs(
										Number(scalar(created, "loop_end")) - clip.duration
									) > 0.0001
								? "The clip markers did not match."
								: "";
			var matches = !problem;
			for (var i = 0; matches && i < actual.length; i++) {
				var fields = ["pitch", "velocity", "start_time", "duration"],
					tolerances = [0.001, 0.01, 0.0001, 0.0001];
				for (var field = 0; matches && field < fields.length; field++) {
					var difference = Math.abs(
						actual[i][fields[field]] - expected[i][fields[field]]
					);
					matches = difference < tolerances[field];
					if (!matches)
						problem =
							"Note " +
							(i + 1) +
							" " +
							fields[field] +
							" differs by " +
							difference.toFixed(6) +
							".";
				}
			}
			if (!matches && ++checks < 10) {
				later(verify, 100);
				return;
			}
			if (!matches) throw new Error(problem);
			finish({
				ok: true,
				title: clip.title,
				noteCount: actual.length,
				destination: target.destination
			});
		} catch (failure) {
			finish({
				ok: false,
				error:
					"Live did not confirm the MIDI notes. " +
					failure.message +
					" Inspect the clip; no write was retried."
			});
		}
	}
	fill();
}
function notifydeleted() {
	incoming = null;
	enabled = false;
	for (var i = 0; i < tasks.length; i++) tasks[i].cancel();
	tasks = [];
}
