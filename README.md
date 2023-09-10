# MIDIjourney: Your AI Musical Companion

<img width="600" alt="Screenshot 2023-09-10 at 21 17 26" src="https://github.com/ElliotEtag/MIDIjourney/assets/5099901/d63b7e3a-d79f-4134-948d-3af4336e3326">

## Developed by Pixelynx's KORUS Labs ([pixelynx.io](https://pixelynx.io))

Welcome to MIDIjourney. Brought to you by the team at Pixelynx's KORUS Labs, and shaped by the artistic direction of Richie Hawtin and deadmau5, this plugin seamlessly integrates artificial intelligence to elevate your music-making experience.

## Take a Whimsical Detour into Tune Town

MIDIjourney isn't just a tool; it's your AI musical companion. Whether you're working on intricate solos, composing backing tracks, or fleshing out a new musical concept, MIDIjourney can provide that extra spark to make your work shine.

Designed for ease of use, MIDIjourney seamlessly integrates with Ableton Live. You don't need to be an AI or music expert to make the most out of it. The code is open-source and documented, providing you with all the resources you need.

Plus, it's an extension of our KORUS ecosystem, providing unprecedented avenues for creativity and monetization that will help artists grow exponentially.

## Features

- **Easy Integration with Ableton Live**: Seamless experience that lets you focus on making music.
- **Describe Your Music Idea in Words, Powered by OpenAI GPT**: Simply tell the AI what you're imagining, and watch it turn your idea into music.
- **Educational Insights**: Get explanations of what MIDIjourney is doing, providing you an educational angle to understand the AI and music theory behind your creations.
- **Clip Variations and Continuations**: Generate new takes on existing clips or complete the musical ideas.
- **Clips Colored According to Circle of Fifths**: Visual harmony cues to make your workflow even smoother.
- **Conversational History**: Recall past musical ideas for a cohesive song creation.
- **Temperature Control**: Dial up the creativity or chaos with an adjustable "temperature" setting.

## Getting Started

To use MIDIjourney in Ableton Live:

1. Drag the device/MIDIjourney.amxd file onto the master track of your Live project. 
2. Configure your OpenAI API access by following the steps in the "Setting Up OpenAI API Access" section above.
3. Click on an empty MIDI clip slot. 
4. Type a text prompt describing the musical idea you want generated.
5. Click the "Generate" button. MIDIjourney will contact the OpenAI API and generate a new MIDI clip based on your prompt.
6. You can also click on an existing MIDI clip and modify the prompt to have MIDIjourney generate variations or continuations of that musical idea.

## What's Inside?

Dive deeper into the code to explore the technical aspects. It's a learning opportunity to understand AI, music conversion, and interaction with various APIs.

### Main Files and Folders

- **MIDIjourney.amxd**: This is the main Max for Live device.
- **patchers/**: Folder containing Max for Live patchers that contribute to device functionality.
- **js/**: The core of MIDIjourney. These files governs how MIDI messages are generated and manipulated.

### Setting Up OpenAI API Access

To use MIDIjourney's OpenAI features, you'll need to set up API access:

1. Create an OpenAI account and navigate to the API section.
2. Generate a new API key and paste it into the "API KEY" box.

## License

Developed by Elliot Fouchy and Thomas Haferlach, this project is under the MIT License, giving you the freedom to explore and modify as you wish. 

### Technologies Utilized

- [KORUS Labs](https://korus.co/koruslabs)
- [OpenAI GPT](https://openai.com/research/gpt-3/)
- [Ableton Live](https://www.ableton.com/)
- [Max MSP / Max for Live](https://cycling74.com/products/max)
- [Pollinations.AI](https://pollinations.ai)

Join us on this journey to redefine the boundaries of music creation!
