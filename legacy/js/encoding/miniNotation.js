
// import {mini} from '@strudel.cycles/mini';
// import { Chord, Note } from "tonal";

const { mini } = require('@strudel.cycles/mini');
const { Chord, Note } = require("tonal");
const { clipToText } = require('./clipFormatter');

// TODO: handle inversion
function expandChords(miniNotation) {
    // const chordRegex = /\(([^)]+)\)/g;
    const chordRegex = /{([^}]+)}/g;
    let expandedNotation = miniNotation;
    
    const matches = miniNotation.match(chordRegex);

    if (matches) {
      matches.forEach((chordName) => {
        // Remove the surrounding parentheses and get the chord notes.
        let chordNameClean = chordName.slice(1, -1).split('/')[0];
        
        // replace minor and min with m and major and maj with "" to match tonal's chord names. ignoring case
        chordNameClean = chordNameClean.replace(/minor|min/gi, 'm');
        chordNameClean = chordNameClean.replace(/major|maj/gi, '');
        

        const chordNotes = Chord.get(chordNameClean).notes;
        
        if (chordNotes && chordNotes.length > 0) {
          const chordNotesString = `[${chordNotes.join(',')}]`;
          // Replace the original chord notation with the expanded notes, joined by some delimiter like ' '.
          expandedNotation = expandedNotation.replace(chordName, chordNotesString);
        } else {
          console.warn(`Chord ${chordNameClean} not found. not replacing.`);
        }
      });
    }
    
    return expandedNotation;
  }




// [ 0/1 → 1/2 | A ] TimeSpan { begin: { s: 1, n: 0, d: 1 }, end: { s: 1, n: 1, d: 2 } } A
// [ 1/2 → 3/4 | B ] TimeSpan { begin: { s: 1, n: 1, d: 2 }, end: { s: 1, n: 3, d: 4 } } B
// [ 3/4 → 1/1 | C ] TimeSpan { begin: { s: 1, n: 3, d: 4 }, end: { s: 1, n: 1, d: 1 } } C

// convert event notation to ableton pattern
// [{
//     pitch,
//     start_time,
//     duration,
//     velocity
// },...]

function convertEventNotation(events) {
    const notes = events.map((e) => {
        const pitch = getMidiFromNote(e.value);
        const start_time = e.whole.begin.n / e.whole.begin.d * 4;
        const noteEnd = e.whole.end.n / e.whole.end.d * 4;
        const duration = noteEnd - start_time;
        const velocity = 100;

        return {
            pitch,
            start_time,
            duration,
            velocity
        }
    });

    return notes;
}

function miniToAbleton(miniNotation, duration=16) {
    const expanded = expandChords(miniNotation);
    console.log("expanded pattern", expanded);
    const events = mini(expanded).queryArc(0, duration);
    // console.log("events", ...events.map(e => [e.whole, e.part]));
    const notes = convertEventNotation(events);
    return notes;
}



function getMidiFromNote(noteName) {

  // if noteName can be parsed as an integer, it is a midi number
  if (!isNaN(noteName)) {
    return parseInt(noteName);
  }

  let tonalNote = Note.get(noteName);

    // if midi could not be determined it means there was no octave provided.
    // use the default octave number 4
    if (tonalNote.midi === null) {
        tonalNote = Note.get(noteName + "4");
    }

    return tonalNote.midi;
}

// construct a response with placeholder values to show as an example to chatgpt
const responseFormat = clipToText({ 
	title: "title",
	explanation: "explanation - optional",
	duration: "duration in beats - optional", 
	key: "musical key - optional",
	notation: 
`...`
});





const miniNotationDescription = `
- Respond in a structured way with title, explanation of what you will do and mini notation each on their own line.
- The title should be short (20 characters maximum).
- The mini notation should contain no parentheses or other characters surrounding it.

Response format:
${responseFormat}

## Mini Notation Guide

### Note Types:

- \`b\` — **Single Note**
- \`c#4\` — **Note with Octave**
- \`63\` — **MIDI Pitch**

### Notations and Corresponding Functions:

- \`c\` — Loop one note: \`sequence(c, c, c, ...)\`.
- \`c d e\` — Multiple notes. Duration stays same: \`sequence(c, d, e)\`.
- \`e5/2.75\` — Slow down: \`e5.slow(2.75)\`.
- \`e5*2\` — Speed up: \`e5.fast(2)\`.
- \`<e5 c3>\` — Add notes: \`slowcat(e5, c3)\`.
- \`eb5 [b4 c5]\` — Complex rhythms: \`sequence(eb5, [b4, c5])\`.
- \`b4 [~ c5]\` — Add silence: \`sequence(b4, [silence, c5])\`.
- \`[g3,b3]\` — Multiple notes: \`stack(g3, b3)\`.
- \`<[g3,b3,e4] [a3,c3,e4] [b3,d3,f#4]>\` — Chord progression.
- \`<g e@2>\` — Varied duration: \`timeCat([1, g], [2, e])\`.
- \`<g3!2>\` — Repeat notes: \`repeat(g3, 2)\`.
- \`[b4 db4](4,9,2)\` — Euclidean rhythm (beats,segments,[offset]): \`pure(b4).euclid(3, 8)\`.

### Chord Notation:

- \`{name/[inversion]}\` — Expands to a note sequence: \`chord(name, inversion=1)\`. Only chord names allowed inside (). E.g.  (Cmaj7)@3(Dm7/2)
  - Examples: \`{Cmaj7}\` to \`[C4, E4, G4, B4]\`
-  {Cmaj7/3} {Dm7}"\` — Sequence: \`sequence(chord(Cmaj7,3),chord(Dm7))\`.

### Notes:

- <> should always be the outermost never nested or multiple in a row as behaviour is not as expected (it interleaves the notes))
- 1 unit of time = 1 bar = 4 beats
- the function notation (e.g. e5.slow(2.75)) is not supported in the mini notation yet.
`;

const example1Response = clipToText({
  title: "Boc chords (Am7 D7 Gmaj7 Cmaj7)",
  explanation: "Boards of Canada often employ simple yet emotionally evocative chord progressions that are combined with vintage synth sounds and tape effects. Here is a simple chord progression: Am7 - D7 - Gmaj7 - Cmaj7",
  notation: "<{Am7}@1 {D7}@2 {Gmaj7}@0.75 {Cmaj7}@0.25>",
  duration: 4
});


const example2Response = clipToText({
  title: "Tetris (Gm)",
  explanation: "Sequence notes E5 to A4 with quick alternations (E5, B4-C5, D5, C5-B4; A4, A4-C5, E5, D5-C5; B4, pause, C5-D5-E5; C5, A4, A4, pause). Accompany with bass. Adjust tempo for Tetris pace.",
  notation: "[[[d2 d3]*4] [[g2 g3]*4] [[f#2 f#3]*2 [d2 d3]*2] [g2 g3 g2 g3 g2 g3 a1 b1],[d5 [a4 b4] c5 [b4 a4]] [g4 [g4 b4] d5 [c5 b4]] [a4 [~ b4] c5 d5] [b4 g4 g4 ~]]/2",
  duration: 4
});

const example3Response = clipToText({
  title: "A Minor Arpeggio",
  explanation: "The given note sequence will be transformed into an arpeggio in the key of A minor by reordering the notes of each chord.",
  notation: "<[[a3 c4 e4 a4]*4] [[b3 d4 f4 b4]*4] [[d3 f4 a4 d4]*4] [[e3 g4 b4 e4]*4]>",
  duration: 16
});

const miniNotationExamples = `
examples:

prompt: a boards of canada style chord progression

response:
${example1Response}


prompt: the tetris melody in g minor

response:
${example2Response}

request:
duration_bars:1
pitch_semitones,start_time,duration_beats
60,0,4
64,0,4
67,0,4
69,0,4
60,4,4
62,4,4
65,4,4
69,4,4

prompt:make this into an arpeggio in a minor

response:
${example3Response}

.
`;


module.exports = {
    miniToAbleton,
    miniNotationDescription,
    miniNotationExamples
}

// console.log(miniToAbleton("<{Amin9} {Bmin11} {F13} {E7#9}>[4,9,2]"))

