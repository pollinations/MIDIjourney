const { clipToText } = require('./clipFormatter.js');


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
		if (!pitch  || !duration)
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
- First downbeat at beat 0,  second at beat 4.
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
60,0,1.75,63
64,0,2.25,76
67,0,2.33,92
71,0.45,1.8,110
62,2,2.5,127
...`});

const example2Prompt = "Transform this into a chirpy arpeggio"

const example2 = clipToText({
	title: "Chirpy Arpeggio",
	explanation: "I will transform the given chord progression into a chirpy arpeggio by playing the notes of each chord in a quick succession.",
	duration: 4,
	key: "A minor",
	notation:
`${CSV_HEADER}
60,0,0.5,80
64,0.66,0.33,100
67,1.33,0.66,120
71,2,1.75,127
62,4,0.66,55
...`});

const example1Prompt = "Make a boards of canada style chord progression in 4 bars."

const example1 = clipToText({
	title: "Boc Style Chords (Am7 D7 G7 C7)",
	explanation: "Boards of Canada often employ simple yet emotionally evocative nostalgic chord progressions. E.g.: Am7 D7 G7 C7",
	duration: 16,
	key: "C major",
	notation: 
`${CSV_HEADER}
69,0,4.25,50
72,0.25,3.5,65
76,0.66,3.66,95
79,1.33,3,110
74,4.25,3.75,75
78,4.5,3.44,90
81,4.85,3.33,100
84,4.75,2.25,55
...`});


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

