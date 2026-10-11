# Hosted Midi Journey agent

Midi Journey 2 calls `community/pollinations-ai/midijourney` through the
Pollinations SDK. The existing D1 prompt-based agent remains the source of
truth for its prompt, base model and enabled MCP tools. This repository does
not upload a replacement agent or update the production prompt.

## Tool routing

Model requests, such as asking for Gemini, are passed to the hosted agent.
Its runtime can perform consecutive tool steps, such as discovery followed by
generation. Actual execution depends on the configured tools and supported
models. Verify tool results before claiming a particular model was used.
The local Pollinations prompt-agent runtime inspected on October 11, 2026
allows eight steps and sixteen tool calls; these are runtime limits, not a
promise about every future hosted configuration.

## Device behavior and spending

The app sends no system prompt. It validates returned MIDI before enabling
Create clip; errors and prose never become clip writes. Fresh selected MIDI
and bounded recent conversation provide context.

Recognized exact single-clip transpositions run locally and still require
Create clip. Other messages make one SDK request without automatic paid
retries; the hosted agent may make several model/tool calls within that request.
Cancellation cannot undo upstream spending. Keys and budgets are unchanged.

## Release validation

The frozen device was tested against the existing hosted agent. The earlier
local TypeScript-agent experiment is no longer part of this release. No agent
upload is required. Any later prompt, tool, model or routing change needs its
own approval and validation.
