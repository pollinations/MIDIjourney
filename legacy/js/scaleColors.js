
/**
 * Returns the color code for a given chord or scale name.
 * 
 * @param {string} chordName - The name of the chord or scale.
 * @returns {number} The color code associated with the given chord name. Returns default color if chord name is not found.
 */
const getColorCodeForScale = (chordName) => {
  const normalizedChord = chordName && chordName.toLowerCase();
  return chordToCamelot[normalizedChord] || defaultColor;
};



// Define the color codes for each Camelot Wheel key.
const camelotColors = {
    1: 16773172,
    2: 14939139,
    3: 12581632,
    4: 8912743,
    5: 5111762,
    6: 1698303,
    7: 9160191,
    8: 9611263,
    9: 12094975,
    10: 14183652,
    11: 16726484,
    12: 16726484
  };

// Define the default color if the key is not found. (white)
const defaultColor = 16777215;


// Define the mapping between Camelot Wheel keys and chords.
const camelotChords = {
  1: ["ab minor", "g# minor", "b major", "cb major"],
  2: ["eb minor", "d# minor", "f# major", "gb major"],
  3: ["bb minor", "a# minor", "db major", "c# major"],
  4: ["f minor", "e# minor", "ab major", "g# major"],
  5: ["c minor", "b# minor", "eb major", "d# major"],
  6: ["g minor", "f# minor", "bb major", "a# major"],
  7: ["d minor", "c# minor", "f major", "e# major"],
  8: ["a minor", "g# minor", "c major", "b# major"],
  9: ["e minor", "d# minor", "g major", "f# major"],
  10: ["b minor", "a# minor", "d major", "c# major"],
  11: ["f# minor", "e# minor", "a major", "g# major"],
  12: ["db minor", "c# minor", "e major", "fb major"]
};

// Create a reverse lookup object from chords to Camelot colors.
// I.e chords as keys and colors as values.
const chordToCamelot = Object.fromEntries(
  Object.entries(camelotChords).flatMap(([key, chords]) =>
    chords.map((chord) => [chord, camelotColors[key]])
  )
);
  

  
  exports.getColorCodeForScale = getColorCodeForScale;