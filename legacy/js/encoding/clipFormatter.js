const yaml = require('js-yaml');

/**
 * Converts a YAML-formatted response to a clip object.
 * 
 * @param {string} response - The YAML-formatted response string.
 * @returns {Object} A clip object.
 */
function textToClip(response) {
	let parsedResponse;

	// Check for ``` quoted code blocks
	const codeBlocks = response.match(/```(?:\w+)?\s*([\s\S]*?)\s*```/g);
	let yamlContent;

	console.error("codeblocks", codeBlocks);

	if (codeBlocks && codeBlocks.length >= 1) {
		// Extract text between the first ```
		yamlContent = codeBlocks[0].replace(/```(?:\w+)?\s*|\s*```/g, '');
	} else {
		// No code blocks found, use the whole response
		yamlContent = response;
	}

	console.error("trying to parse", yamlContent);

	try {
		parsedResponse = yaml.load(yamlContent);
	} catch (error) {
		console.error('Failed to parse YAML:', error);
		throw error;
	}

	// Destructure and check for required fields
	const { title, duration, key, explanation, notation } = parsedResponse;

	if (!title) {
		throw new Error('Missing required fields: title');
	}

	if (!notation) {
		throw new Error('Missing or empty required field: notation');
	}

	// Remove all " ' ` and \ characters in notes
	const cleanedNotation = notation.replace(/["'`\\]/g, '');

	return {
		title: title.trim(),
		duration,
		key: key ? key.trim() : null,
		explanation: explanation ? explanation.trim() : '',
		notation: cleanedNotation,
	};
}

/**
 * Converts a clip object to a YAML-formatted response.
 * 
 * @param {Object} clip - The clip object.
 * @returns {string} A YAML-formatted response string.
 */
const clipToText = ({ title, duration, key, explanation, notation }) => {
	if (!title || !duration) {
		throw new Error('Missing required fields: title and/or duration');
	}

	if (!notation) {
		throw new Error('Missing or empty required field: notation');
	}

	// Prepare the data object
	const data = {
		"title": title.trim(),
		"duration": duration,
		"key": key ? key.trim() : null,
		"explanation": explanation ? explanation.trim() : '',
		"notation": notation.replace(/["'`\\]/g, ''),
	};

	// Convert the data object to a YAML string
	let yamlString;
	try {
		yamlString = yaml.dump(data);
	} catch (error) {
		console.error('Failed to convert to YAML:', error);
		return null;
	}

	return yamlString;
};

/**
 * Constructs the prompt message for the GPT model based on input parameters.
 * @param {Object} params - The input parameters.
 * @param {string} params.promptText - The text to be used as the prompt for the GPT model.
 * @param {number} params.duration - The duration of the musical piece.
 * @param {string} params.notation - The array containing note data.
 * @param {string} params.title - The title of the musical piece.
 * @param {string} params.key - The key of the musical piece.
 * @param {string} params.explanation - Additional explanation or details.
 * @returns {Object} The constructed prompt message object.
 */
function constructPrompt({ promptText, duration, title, key, explanation }, notation) {

	if (!notation)
		return userMessage(`# Prompt\n${promptText}\n\n# Response\n`)

	// construct prompt
	const inputPrompt = clipToText({
		title,
		duration,
		key,
		explanation,
		notation
	});

	const prompt = `# Request
${inputPrompt}
# Prompt
${promptText}

# Response`;

	const promptMessage = userMessage(prompt);
	return promptMessage;
}

const userMessage = content => ({ role: "user", content });

exports.constructPrompt = constructPrompt;
exports.textToClip = textToClip;
exports.clipToText = clipToText;

// const testText = `\`\`\`yaml
// title: Quacking Frog
// duration: 16
// key: E minor
// explanation: >-
//   An intricate arpeggio in E minor that evokes the melancholic sound of a frog quacking.
//   Dynamic variations illustrate its enthusiasm as it attempts to catch an insect. The piece
//   utilizes uneven note durations and varied velocities to create a whimsical and lifelike
//   portrayal.
// notation: |-
//   pitch,time,duration,velocity
//   64,0,0.75,60
//   67,0.75,0.5,70
//   71,1.3,0.65,80
//   74,1.95,0.55,75
//   77,2.5,0.8,85
//   74,3.3,0.45,90
//   71,3.75,0.7,80
//   67,4.45,0.6,70
//   64,5.05,0.75,75
//   67,5.8,0.5,85
//   71,6.35,0.65,95
//   74,7,0.55,100
//   77,7.55,0.8,110
//   74,8.35,0.45,95
//   71,8.8,0.7,85
//   67,9.5,0.6,75
//   64,10.1,0.75,80
//   67,10.85,0.5,90
//   71,11.4,0.65,100
//   74,12.05,0.55,110
//   77,12.6,0.8,120
//   74,13.4,0.45,105
//   71,13.85,0.7,95
//   67,14.55,0.6,85
//   64,15.15,0.75,90
//   67,15.9,0.5,100
// \`\`\`
// `
// console.error(textToClip(testText));