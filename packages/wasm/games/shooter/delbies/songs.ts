// The game's music: which song the engine hears where. The songs are MP3s in music/, Mikey's,
// brought down to 32 kHz and 112 kbit/s so the four are 9 MB and not 16.
//
// They are not in the WAD. A song's lump there is one line, "song:" and its name, and the page
// fetches the file the first time the engine asks for it (src/shooter/audio.ts), so the game
// starts on 2 MB and a song is only downloaded once it is wanted. A real MP3, Ogg or WAV put in
// a song's lump (the editor's Everything else tab) is played as it always was.

/** The songs, by name: the file is music/<name>.mp3. */
export const SONG_NAMES = ["brass-and-heavy-iron", "steel-teeth", "stripped-to-bone", "aisle-four-is-a-trap"] as const;
export type SongName = (typeof SONG_NAMES)[number];

const [BRASS, TEETH, BONE, AISLE] = ["brass-and-heavy-iron", "steel-teeth", "stripped-to-bone", "aisle-four-is-a-trap"] as const;

/** What plays on each of the twelve levels, in order: the King Rat's floors (3, 8, 10 and 12) have his song. */
const FLOORS: SongName[] = [TEETH, BONE, AISLE, TEETH, BONE, TEETH, BONE, AISLE, TEETH, AISLE, BONE, AISLE];

/** The engine's name for each song's lump, and the song that goes there: the title, the page between levels, the ending, and the levels. */
export const SONGS: Record<string, SongName> = {
  D_INTRO: BRASS,
  // The engine asks for the title's song by this name when it thinks it has a sound card's synthesiser.
  D_INTROA: BRASS,
  D_INTER: BRASS,
  D_VICTOR: BRASS,
  ...Object.fromEntries(FLOORS.map((song, index) => [`D_E${Math.floor(index / 9) + 1}M${(index % 9) + 1}`, song])),
};
