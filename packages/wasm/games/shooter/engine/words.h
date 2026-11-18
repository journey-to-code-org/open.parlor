// [open.wasm] A new file. The game's words, from the WAD: see words.c.
#ifndef WORDS_H
#define WORDS_H

char *Words_For(char *s);
void Words_Tell(const char *what, int gap);
char *Words_About(const char *what);
int Words_Number(const char *what, int otherwise);

#endif
