// const { miniNotationDescription, miniToAbleton, miniNotationExamples } = require('./encoding/miniNotation.js');
const { abletonToCSV, csvToAbleton, csvNotationDescription, csvNotationExamples } = require('./encoding/csvNotation.js');
const { textToClip, constructPrompt } = require('./encoding/clipFormatter.js');
const { max, errorToMax } = require('./maxUtils/max.js');
const { getChatGptResponse, abort, API_KEY_MISSING_ERROR, QUOTA_EXCEEDED_ERROR } = require('./openai.js');
const { checkMidi } = require('./encoding/checkMidi.js');
const { getColorCodeForScale } = require('./scaleColors.js');
const { last } = require('ramda');

// const { miniToAbleton, miniNotationDescription, miniNotationExamples } = require('./encoding/miniNotation.js');
const notationEncoder = abletonToCSV;

// const notationDecoder = miniToAbleton;
// const notationDescription = miniNotationDescription;
// const notationExamples = miniNotationExamples;

const NOTATION_TYPE_OUTPUT = "csv";

const NOTATION_DECODER = csvToAbleton;
const NOTATION_DESCRIPTION = csvNotationDescription;
const NOTATION_EXAMPLES = csvNotationExamples;


const INITIAL_HISTORY = [];

/**
 * Main function to call. Handle the initialization of necessary variables, retrying on failures, and manage error handling.
 * @async
 * @param {Object} inputDict - The input parameters.
 * @returns {Promise<Object>} The modified input dictionary.
 * @throws Will throw an error if it fails to get a successful response after 3 tries.
 */
async function prompt(inputDict) {
	max.post("Got the following data", Object.keys(inputDict));
	max.post("detailClip", inputDict.detailClip)

	try {
		// set default values
		inputDict = {
			temperature: 0.7,
			gptModel: "gpt-3.5-turbo-0613",
			key: "unknown",
			title: "unknown",
			explanation: "n/a",
			// 2 bars default duration if none is input
			duration: 2 * 4,
			history: [],
			...inputDict,
		}

		const notes = inputDict.notes;
		// construct csv notation
		const notesCSV = notes && notes.length > 0 ? notationEncoder(notes) : null;
		const promptMessage = constructPrompt(inputDict, notesCSV);

		// add prompt to history
		inputDict = {
			...inputDict,
			history: [...inputDict.history, promptMessage],
		};

		for (let tries = 0; tries < 1; tries++) {
			try {
				inputDict = await gptMidi(inputDict);
				return inputDict;
			} catch (error) {
				// handle error will just output the error to max if it is not canceled
				// else it will throw the error again
				handleError(error);
			}
		}
		throw new Error("The agent request failed. Try again when ready.");
	} catch (error) {
		if (error.message !== "canceled") {
			errorToMax(error.message);
		}
	}
}


/**
 * Handles the core logic of the interaction with the GPT model.
 * @async
 * @param {Object} dict - The dictionary containing input parameters.
 * @returns {Promise<Object>} The dictionary with added or modified values.
 */
async function gptMidi(dict) {
	const { duration, history, historyStatus } = dict;


	// output history (for storage and saving in dictionary)
	max.outlet("processing", dict);

	// if historyStatus is false set history to only contain the last message
	const reducedHistory = historyStatus ? history : [last(history)];

	// get actual midi message from chatgpt
	const midiMessage = await getChatGptResponse([...INITIAL_HISTORY, ...reducedHistory], dict);
	const newHistory = [...history, midiMessage];
	const response = midiMessage.content;
	max.post(`got response\n-------\n${response}`);
	// Extracting data from response
	const { notation, title, explanation, key, duration: durationNew } = textToClip(response);

	// if a duration was returned use that else use the input duration
	const finalDuration = durationNew || duration;


	// Convert to ableton midi
	const abletonMidi = NOTATION_DECODER(notation, finalDuration);
	const midiError = checkMidi(abletonMidi);

	if (midiError)
		throw new Error(midiError);

	// construct the new dictionary
	dict = {
		...dict,
		history: newHistory,
		explanation,
		title,
		key,
		duration: finalDuration,
		color: getColorCodeForScale(key),
		notes: abletonMidi,
	};


	max.post("determined color", dict.color, "from key", key);

	// if notation is csv we should delete the duration so it is estimated by ableton
	if (NOTATION_TYPE_OUTPUT === "csv") {
		delete dict.duration;
	}


	return dict;
}


/**
 * Handles any errors during the prompt function.
 * @param {Error} error - The error object.
 * @throws Will re-throw the error if it was an abort error.
 */
function handleError(error) {
	if (error.name === "AbortError" || error.message === "canceled") {
		max.post("cancelled!!!");
		throw new Error("canceled");
	}


	if (error.message === QUOTA_EXCEEDED_ERROR) {
		max.post("quotaexceedederror", error.message);
		throw new Error(error.message);
	}

	max.post("error", error.message, error.stack);

	if (error.response) {
		max.post("error", error.response.status, error.response.data);
	}

	max.post("Generation failed; no automatic retry.");
}




/**
 * Max message handlers.
 * @type {Object}
 */
max.addHandlers({
	'prompt': async (p) => {
		// if prompt is an array join into one string
		p = Array.isArray(p) ? p.join(" ") : p;
		const outputDict = await prompt(p);

		if (!outputDict)
			return;

		max.post("output keys", Object.keys(outputDict));
		max.outlet("result", outputDict);
	},
	'cancel': () => {
		max.post("received cancel request");
		abort();
	}

});


