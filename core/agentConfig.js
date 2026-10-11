// Use the existing hosted D1 prompt agent for the app and direct callers.
const AGENT_CONFIG = Object.freeze({
	defaultModel: "community/pollinations-ai/midijourney",
	agentBaseUrl: "https://gen.pollinations.ai",
});
module.exports = { AGENT_CONFIG };
