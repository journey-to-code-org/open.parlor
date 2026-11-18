// [open.wasm] A new file. The game's rules, from the WAD.
//
// What a thing is (how much it can take, how fast it is, how big, what it sounds like and is
// drawn with) and a handful of numbers the engine was written with are in its C: info.c,
// p_inter.c, p_pspr.c. A lump called RULES, if the WAD has one, changes them when the game
// starts. It is lines of text:
//
//   thing.12.health=45        a thing, by its place in info.c's list (12 is MT_SERGEANT)
//   thing.12.seesound=DSRAT1  a sound by its lump's name, or - for none
//   thing.12.sprite=RATA      what it is drawn with, in every state of its own
//   ammo.0.max=400            bullets, shells, cells, rockets: 0 to 3
//   rule.gun.damage=8         a number by name: see Rules_Number's callers
//
// A sound or a sprite named here that the engine has none of is given one of the spare places
// at the end of its list, so a WAD can bring sounds and sprites under names of its own. A line
// that starts with # is a comment, and one that makes no sense is passed over.
//
// A game shared with other devices must have the same rules on every one of them.
#include <ctype.h>
#include <stdlib.h>
#include <string.h>

#include "doomdef.h"
#include "info.h"
#include "m_fixed.h"
#include "sounds.h"
#include "w_wad.h"

#include "rules.h"

#define MAXNUMBERS 64

typedef struct
{
    char name[32];
    int value;
} number_t;

static number_t numbers[MAXNUMBERS];
static int numnumbers;

int numsfx = NUMSFX;

extern int maxammo[NUMAMMO];
extern int clipammo[NUMAMMO];

int Rules_Number(const char *what, int otherwise)
{
    int i;

    for (i = 0; i < numnumbers; i++)
        if (!strcmp(numbers[i].name, what))
            return numbers[i].value;
    return otherwise;
}

// A sound by its lump's name ("DSPISTOL"): the engine's own number for it, a spare one if it has none, 0 for none.
static int Rules_Sound(const char *lump)
{
    const char *name = lump;
    int i;

    if (!strcmp(lump, "-") || !*lump)
        return sfx_None;
    if (toupper(name[0]) == 'D' && toupper(name[1]) == 'S')
        name += 2;
    if (!*name || strlen(name) > 6)
        return -1;
    for (i = 1; i < numsfx; i++)
        if (!strcasecmp(S_sfx[i].name, name))
            return i;
    if (numsfx >= NUMSFX + SPARESFX)
        return -1;
    memset(&S_sfx[numsfx], 0, sizeof(S_sfx[numsfx]));
    for (i = 0; name[i]; i++)
        S_sfx[numsfx].name[i] = tolower(name[i]);
    S_sfx[numsfx].priority = 64;
    S_sfx[numsfx].pitch = S_sfx[numsfx].volume = -1;
    S_sfx[numsfx].lumpnum = S_sfx[numsfx].usefulness = -1;
    S_sfx[numsfx].numchannels = -1;
    return numsfx++;
}

// A sprite by its four letters: the engine's own number for it, or a spare one.
static int Rules_Sprite(const char *name)
{
    int i;
    char *kept;

    if (strlen(name) != 4)
        return -1;
    for (i = 0; sprnames[i]; i++)
        if (!strncasecmp(sprnames[i], name, 4))
            return i;
    if (i >= NUMSPRITES + SPARESPRITES)
        return -1;
    kept = malloc(5);
    for (i = 0; i < 4; i++)
        kept[i] = toupper(name[i]);
    kept[4] = '\0';
    for (i = 0; sprnames[i]; i++)
        ;
    sprnames[i] = kept;
    return i;
}

// Every state a thing goes through is drawn with the sprite: each chain of states, from where the thing's own list says it starts.
static void Rules_Draw(mobjinfo_t *info, int sprite)
{
    static byte seen[NUMSTATES];
    int starts[8];
    int i, state;

    starts[0] = info->spawnstate;
    starts[1] = info->seestate;
    starts[2] = info->painstate;
    starts[3] = info->meleestate;
    starts[4] = info->missilestate;
    starts[5] = info->deathstate;
    starts[6] = info->xdeathstate;
    starts[7] = info->raisestate;
    memset(seen, 0, sizeof(seen));
    for (i = 0; i < 8; i++)
        for (state = starts[i]; state > S_NULL && state < NUMSTATES && !seen[state]; state = states[state].nextstate)
        {
            seen[state] = 1;
            states[state].sprite = sprite;
        }
}

static void Rules_Thing(int type, const char *field, const char *value)
{
    mobjinfo_t *info;
    int number = atoi(value);
    int found;

    if (type < 0 || type >= NUMMOBJTYPES)
        return;
    info = &mobjinfo[type];
    if (!strcmp(field, "health") && number > 0)
        info->spawnhealth = number;
    // A thing that flies of itself (a fireball) has its speed kept in the engine's fractions; one that walks, in whole numbers.
    else if (!strcmp(field, "speed") && number >= 0)
        info->speed = info->speed >= FRACUNIT ? number * FRACUNIT : number;
    else if (!strcmp(field, "radius") && number > 0)
        info->radius = number * FRACUNIT;
    else if (!strcmp(field, "height") && number > 0)
        info->height = number * FRACUNIT;
    else if (!strcmp(field, "mass") && number > 0)
        info->mass = number;
    else if (!strcmp(field, "damage") && number >= 0)
        info->damage = number;
    else if (!strcmp(field, "painchance") && number >= 0)
        info->painchance = number > 256 ? 256 : number;
    else if (!strcmp(field, "reaction") && number >= 0)
        info->reactiontime = number;
    else if (!strcmp(field, "sprite"))
    {
        found = Rules_Sprite(value);
        if (found >= 0)
            Rules_Draw(info, found);
    }
    else if (strlen(field) > 5 && !strcmp(field + strlen(field) - 5, "sound"))
    {
        found = Rules_Sound(value);
        if (found < 0)
            return;
        if (!strcmp(field, "seesound"))
            info->seesound = found;
        else if (!strcmp(field, "attacksound"))
            info->attacksound = found;
        else if (!strcmp(field, "painsound"))
            info->painsound = found;
        else if (!strcmp(field, "deathsound"))
            info->deathsound = found;
        else if (!strcmp(field, "activesound"))
            info->activesound = found;
    }
}

void Rules_Apply(void)
{
    int lump, length, which;
    char *text, *line, *next, *equals, *field;

    lump = W_CheckNumForName("RULES");
    if (lump < 0)
        return;
    length = W_LumpLength(lump);
    text = malloc(length + 1);
    W_ReadLump(lump, text);
    text[length] = '\0';
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
        *equals++ = '\0';
        if (!strncmp(line, "thing.", 6))
        {
            which = atoi(line + 6);
            field = strchr(line + 6, '.');
            if (field && isdigit((unsigned char) line[6]))
                Rules_Thing(which, field + 1, equals);
        }
        else if (!strncmp(line, "ammo.", 5) && isdigit((unsigned char) line[5]) && line[6] == '.')
        {
            which = line[5] - '0';
            if (which >= NUMAMMO || atoi(equals) <= 0)
                continue;
            if (!strcmp(line + 7, "max"))
                maxammo[which] = atoi(equals);
            else if (!strcmp(line + 7, "clip"))
                clipammo[which] = atoi(equals);
        }
        else if (!strncmp(line, "rule.", 5) && numnumbers < MAXNUMBERS && strlen(line + 5) < sizeof(numbers[0].name))
        {
            strcpy(numbers[numnumbers].name, line + 5);
            numbers[numnumbers++].value = atoi(equals);
        }
    }
    free(text);
}
