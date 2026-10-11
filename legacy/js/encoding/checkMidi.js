/**
 * Validate if the Ableton Midi data is correct.
 * @param {Array} abletonMidi - The array containing Ableton Midi note data.
 * @returns {null|string} Returns null if midi data is correct or an error message string.
 */
function checkMidi(abletonMidi) {
	let midiError = null;
	if (abletonMidi.length === 0) {
		midiError = "No notes found in midi";
	} else {
		abletonMidi.forEach((note) => {
			midiError = "";
			if (!note.pitch)
				midiError += "pitch is missing,";
			if (!note.duration)
				midiError += "duration is missing,";
			if (!note.velocity)
				midiError += "velocity is missing,";
			if (note.start_time === undefined)
				midiError += "start_time is missing,";
		});
	}
	return midiError;
}

exports.checkMidi = checkMidi;
