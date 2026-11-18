// [open.wasm] A new file. The game's rules, from the WAD: see rules.c.
#ifndef RULES_H
#define RULES_H

// Reads the WAD's RULES lump and makes its changes. Once, after the WAD is open and before the
// sprites and sounds are looked up.
void Rules_Apply(void);

// A number the WAD gives for something ("rule.name=3"), or `otherwise`.
int Rules_Number(const char *what, int otherwise);

// How many sounds there are: the engine's own, and any the rules named beyond them.
extern int numsfx;

#endif
