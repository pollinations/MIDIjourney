require("dotenv").config();
const { Configuration, OpenAIApi } = require("openai");
const fs = require("fs");
const os = require("os");
const { max } = require("./maxUtils/max.js");
const { path } = require("ramda");
const { AbortController } = require("node-abort-controller");

// Initialize global variables and constants
const MAX_TOKENS = Infinity;

const QUOTA_EXCEEDED_ERROR = `
OpenAI API quota exceeded. 

You probably need to fix your OpenAI billing information at https://platform.openai.com/account/billing/overview.
`;

/**
 * Fetches a chat response from a GPT-3.5-turbo model.
 *
 * @async
 * @param {Array} messages - An array of message objects to send to the GPT model.
 * @param {Object} options - Configuration options for the chat.
 * @param {number} options.temperature - Determines the randomness of the output.
 * @param {string} [options.gptModel="gpt-4o"] - The GPT model to use.
 * @returns {Promise<string>} The generated message from the GPT model.
 * @throws Will throw an error if an invalid API key is provided.
 */
async function getChatGptResponse(
  messages,
  { temperature, gptModel = "openai" }
) {
  messages = [...messages];
  printMessages(messages);

  max.post(
    "Getting GPT response. Temperature:",
    temperature,
    "Model:",
    gptModel,
    "Num messages:",
    messages.length
  );

  max.post("creating new abort controller");
  abort();
  abortController = new AbortController();

  try {
    const chat = await openAIApi("dummy").createChatCompletion(
      {
        model: "claude",
        messages,
        // temperature,
        // max_tokens: MAX_TOKENS,
      },
      { signal: abortController.signal }
    );

    const message = chat.data.choices[0].message;
    abortController = null;
    return message;
  } catch (error) {
    max.post("OpenAI error", error.response.data);
    abortController = null;
    // Check for an invalid API key and throw a custom error message
    if (
      path(["response", "data", "error", "code"], error) === "invalid_api_key"
    )
      console.error("invalid_api_key", error);
    // check for quota exceeded
    if (
      path(["response", "data", "error", "code"], error) ===
      "insufficient_quota"
    )
      throw new Error(QUOTA_EXCEEDED_ERROR);
    throw error;
  }
}

let abortController = null;

// Initialize the OpenAI API object
const openAIApi = () => {
  return new OpenAIApi(new Configuration({ basePath: "https://text.pollinations.ai/openai" }));
};

// Print messages to the console
const printMessages = (messages) => {
  max.post(`--- Messages (${messages.length}) ---`);
  messages.forEach((m) => {
    max.post(`[${m.role}]:\n${m.content}\n`);
  });
  max.post(`--- End Messages ---`);
};

// Abort a running request
const abort = () => {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
};

// Export functions and constants
exports.getChatGptResponse = getChatGptResponse;
exports.abort = abort;
exports.QUOTA_EXCEEDED_ERROR = QUOTA_EXCEEDED_ERROR;
