const { clipToText } = require('./clipFormatter.js');

const MAX_NOTES_FOR_INPUT = 24;

const CSV_HEADER = "pitch,time,duration,velocity";

/**
 * Converts Ableton note data to a CSV formatted string.
 * 
 * @param {Array} notes - An array containing Ableton Midi note data.
 * @returns {string} A CSV-formatted string.
 */
const abletonToCSV = (notes) => {
	let lastStartTime = 0;

	// order by start time
	notes.sort((a, b) => a.start_time - b.start_time);

	let csvString = `${CSV_HEADER}\n`;

	notes.forEach((note) => {
		const _offset = note.start_time - lastStartTime;
		lastStartTime = note.start_time;
		csvString += `${floatPrint(note.pitch)},${floatPrint(note.start_time)},${floatPrint(note.duration)},${floatPrint(note.velocity)}\n`;
	});

	return csvString;
};

/**
 * Converts a CSV-formatted string to Ableton note data.
 * 
 * @param {string} csvString - A CSV-formatted string.
 * @returns {Array} An array containing Ableton Midi note data.
 */
const csvToAbleton = (csvString) => {
	console.log("converting to ableton format", csvString);
	const lines = csvString.trim().split('\n');
	const header = lines.shift().split("#")[0].split(',');

	let lastStartTime = 0;
	const notes = lines.map((line) => {
		let [pitch, start_time, duration, velocity] = line.split(',').map(Number);
		if (!pitch || !duration)
			return null;

		if (!velocity)
			velocity = 100;

		velocity = Math.min(Math.max(velocity, 1), 126);

		lastStartTime = start_time;

		return {
			pitch,
			start_time,
			duration,
			velocity
		};
	}).filter((note) => note !== null);

	return notes;
};

// construct a response with placeholder values to show as an example to chatgpt
const responseFormat = clipToText({
	title: "title",
	explanation: "explanation - optional",
	duration: "duration in beats - optional",
	key: "musical key - optional",
	notation:
		`${CSV_HEADER}
...`
});

const csvNotationDescription = `
- The response is in YAML format. 
- The notation is in CSV format.
- Start times and durations are in beats. 
- Time signature is 4/4. 
- First downbeat at beat 0, second at beat 4.
- Drums use GM midi pitches. (e.g. 38 is a snare drum)
- Velocity is between 0-127

# Response format
${responseFormat}`;

const example2Input = clipToText({
	title: "Simple 1 bar progression in A minor",
	explanation: "I will play a simple 1 bar progression in A minor.",
	duration: 4,
	key: "A minor",
	notation:
		`${CSV_HEADER}
60,0,1,63
64,0,1,76
67,0,1,92
71,0,1,110
62,1,1,127
65,1,1,85
69,1,1,95
72,1,1,105
60,2,1,63
64,2,1,76
67,2,1,92
71,2,1,110
62,3,1,127
65,3,1,85
69,3,1,95
72,3,1,105`});

const example2Prompt = "Transform this into a chirpy arpeggio";

const example2 = clipToText({
	title: "Chirpy Arpeggio",
	explanation: "I will transform the given chord progression into a chirpy arpeggio by playing the notes of each chord in quick succession.",
	duration: 4,
	key: "A minor",
	notation:
		`${CSV_HEADER}
60,0,0.25,80
64,0.25,0.25,85
67,0.5,0.25,90
71,0.75,0.25,95
62,1,0.25,100
65,1.25,0.25,105
69,1.5,0.25,110
72,1.75,0.25,115
60,2,0.25,80
64,2.25,0.25,85
67,2.5,0.25,90
71,2.75,0.25,95
62,3,0.25,100
65,3.25,0.25,105
69,3.5,0.25,110
72,3.75,0.25,115`});

const example1Prompt = "Make a boards of canada style chord progression in 4 bars.";

const example1 = clipToText({
	title: "BoC Style Chords (Am7 D7 G7 C7)",
	explanation: "Boards of Canada often employ simple yet emotionally evocative nostalgic chord progressions. E.g.: Am7 D7 G7 C7",
	duration: 16,
	key: "C major",
	notation:
		`${CSV_HEADER}
69,0,4,90
72,0.5,3.5,80
76,1,3,70
79,1.5,2.5,60
62,4,4,90
66,4.5,3.5,80
69,5,3,70
72,5.5,2.5,60
67,8,4,90
71,8.5,3.5,80
74,9,3,70
77,9.5,2.5,60
60,12,4,90
64,12.5,3.5,80
67,13,3,70
70,13.5,2.5,60`});

const csvNotationExamples =
	`
# Request

# Prompt
${example1Prompt}

# Response
${example1}

# Request
${example2Input}

# Prompt
${example2Prompt}

# Response
${example2}`;

exports.abletonToCSV = abletonToCSV;
exports.csvToAbleton = csvToAbleton;
exports.csvNotationDescription = csvNotationDescription;
exports.csvNotationExamples = csvNotationExamples;

// function to print float with 2 decimal places
const floatPrint = (n) => parseFloat(n.toFixed(2));
