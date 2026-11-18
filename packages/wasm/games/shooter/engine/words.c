// [open.wasm] A new file. The game's words, from the WAD.
//
// A lump called WORDS, if the WAD has one, is lines of text of two kinds:
//
//   Picked up a clip.=Found a box of fuses.
//       the engine's own words (as they are in d_englsh.h) and what to say in their place;
//   !kill=Got him!|That's one less.
//       something to say when a thing happens, one of them picked each time.
//
// A line that starts with # is a comment. "\n" in what is said is a new line. The first kind is
// looked up wherever the engine was written to let its words be replaced (DEH_String, which
// doomgeneric had switched off). The second is new: Words_Tell puts a line on the screen of the
// player at this device when the level starts ("start"), a monster notices them ("see"), one
// hurts them ("hurt"), they kill one ("kill"), and they die ("die"). The lines are picked with
// the menu's dice, not the game's, so they change nothing in a game shared with other devices.
#include <stdlib.h>
#include <string.h>

#include "doomdef.h"
#include "doomstat.h"
#include "m_random.h"
#include "w_wad.h"
#include "z_zone.h"

#include "words.h"

typedef struct
{
    char *from;
    char *to;
} word_t;

static word_t *words;
static int numwords;
static boolean loaded;

extern unsigned int numlumps;

static void Words_Load(void)
{
    int lump, length, i, lines;
    char *text, *line, *next, *equals, *in, *out;

    // Asked before the WAD is open (the banner at the start is), there is nothing to read yet.
    if (numlumps == 0)
        return;
    loaded = true;
    lump = W_CheckNumForName("WORDS");
    if (lump < 0)
        return;
    length = W_LumpLength(lump);
    text = malloc(length + 1);
    W_ReadLump(lump, text);
    text[length] = '\0';
    for (lines = 1, i = 0; i < length; i++)
        if (text[i] == '\n')
            lines++;
    words = malloc(lines * sizeof(word_t));
    for (line = text; line && *line; line = next)
    {
        next = strchr(line, '\n');
        if (next)
            *next++ = '\0';
        if (*line && line[strlen(line) - 1] == '\r')
            line[strlen(line) - 1] = '\0';
        equals = strchr(line, '=');
        if (*line == '#' || !equals || equals == line || !equals[1])
            continue;
        *equals = '\0';
        // "\n", typed as two characters, is a new line.
        for (in = out = equals + 1; *in; in++)
        {
            if (in[0] == '\\' && in[1] == 'n')
            {
                *out++ = '\n';
                in++;
            }
            else
                *out++ = *in;
        }
        *out = '\0';
        words[numwords].from = line;
        words[numwords].to = equals + 1;
        numwords++;
    }
}

static char *Words_Find(const char *from)
{
    int i;

    if (!loaded)
        Words_Load();
    for (i = 0; i < numwords; i++)
        if (!strcmp(words[i].from, from))
            return words[i].to;
    return NULL;
}

// The words to use in place of the engine's own.
char *Words_For(char *s)
{
    char *found = Words_Find(s);
    return found ? found : s;
}

// One of the lines for something that has happened; NULL if there are none.
static char *Words_Say(const char *what)
{
    // A message is shown for a few seconds after it is set, so the last few are kept.
    static char said[4][160];
    static int turn;
    char key[32];
    char *all, *pick, *end;
    int choices, chosen;
    size_t length;

    key[0] = '!';
    strncpy(key + 1, what, sizeof(key) - 2);
    key[sizeof(key) - 1] = '\0';
    all = Words_Find(key);
    if (!all)
        return NULL;
    for (choices = 1, pick = all; *pick; pick++)
        if (*pick == '|')
            choices++;
    chosen = M_Random() % choices;
    for (pick = all; chosen > 0; pick++)
        if (*pick == '|')
            chosen--;
    end = strchr(pick, '|');
    length = end ? (size_t)(end - pick) : strlen(pick);
    if (length == 0)
        return NULL;
    if (length > sizeof(said[0]) - 1)
        length = sizeof(said[0]) - 1;
    turn = (turn + 1) % 4;
    memcpy(said[turn], pick, length);
    said[turn][length] = '\0';
    return said[turn];
}

// Says something to the player at this device, unless something was said less than `gap` tics ago.
void Words_Tell(const char *what, int gap)
{
    static int last = -100000;
    char *line;

    if (gametic - last < gap)
        return;
    line = Words_Say(what);
    if (!line)
        return;
    last = gametic;
    players[consoleplayer].message = line;
}
