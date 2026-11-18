# What was changed in the engine

This folder is the Doom engine as [doomgeneric](https://github.com/ozkl/doomgeneric) has it
(commit `e257a09527062bfb986b6e5e0780839b6cbd5b71`), which is id Software's source by way of
Chocolate Doom. It is under the GNU General Public License, version 2 or later: see `LICENSE`.

The files are doomgeneric's `doomgeneric/*.c` and `*.h`, without its ports to other platforms
(`doomgeneric_*.c`), its SDL and Allegro sound (`i_sdl*.c`, `i_allegro*.c`) and `icon.c`. The
platform they are built for here is in `../platform/`.

Every change is marked `[open.wasm]` where it is made. First changed 17 November 2026.

| File | Change |
| --- | --- |
| `d_main.c` | The screen wipe was a loop that slept between steps. It is now one step for each call to `doomgeneric_Tick`, and the game waits while it runs, as it did. |
| `d_main.c` | The first frame no longer wipes from an empty screen to an empty screen (a second of black before the title). |
| `d_main.c` | `G_CheckDemoStatus` was registered to run at exit through a cast to a different function type, which WebAssembly refuses to call. It is registered through a function of the right type. |
| `d_loop.c` | `TryRunTics` slept until a tic came due. It returns instead, and finds the tic on the next call. |
| `d_loop.c`, `d_net.c` | A game with other devices. `-net <players> <me>` starts one (`<me>` of -1 watches). Each tic's command is handed to the platform (`web_net_send`) where `NET_CL_SendTiccmd` was, and tics come back through `D_ReceiveTic`; the check that every player's command has arrived is compiled in again. `D_NetBacklog` says how many have arrived and not been run. |
| `g_game.c` | `G_BuildTiccmd` adds a thumb-stick's movement and turning (`web_forward`, `web_side`, `web_turn`) to each tic's command. |
| `st_stuff.c` | `ST_Start` loads the face's background again, for the player being shown now: a device that watches changes players. |
| `i_input.c` | `I_GetEvent` asks the platform for the mouse (`web_input`) before it reads the keys. |
| `i_video.c` | The frame is written red, green, blue, 255, the order a canvas takes, not blue, green, red, 0. |
| `i_sound.c` | No `SDL_mixer.h`, and no resampler settings: the page plays the sound. |
| `m_config.c` | The settings file is read and written again (doomgeneric had switched both off). |
| `info.c` | The pink demon (`MT_SERGEANT`) is the game's grease rat, and is given a rat's numbers: 45 health for 150, speed 13 for 10, 24 across for 30, 36 tall for 56. |
| `p_enemy.c` | `A_SargAttack`, the grease rat's bite, does 2 to 8 where the demon's did 4 to 40: they come in numbers. |
| `words.c`, `words.h` (new), `deh_str.h` | The game's words come from the WAD. A `WORDS` lump replaces the engine's own text (through `DEH_String`, which doomgeneric had switched off) and gives lines to say when things happen. |
| `p_inter.c`, `p_enemy.c`, `p_setup.c` | `Words_Tell` is called when the level starts, a monster notices the player, one hurts them, they kill one, and they die. Only the player at this device is told, and the lines are picked with the menu's dice, so a shared game is unchanged. |
| `rules.c`, `rules.h` (new), `d_main.c`, `deh_misc.h`, `p_pspr.c` | The game's rules come from the WAD. A `RULES` lump changes what a thing is (health, speed, size, mass, damage, pain chance, its sounds, the sprite it is drawn with, where its moments start), what each of its moments is (its picture, how long it lasts, what it runs, the moment after), how much ammunition is held and picked up, the numbers dehacked's "Misc" block would (`deh_misc.h`: they were fixed), and the damage, pellets and scatter of the fist, saw and guns. |
| `info.c`, `info.h`, `sounds.c`, `sounds.h`, `s_sound.c` | Sixty-four spare places at the end of the lists of sprites and of sounds, for ones a WAD's rules name that the engine has none of. And 512 spare moments and 32 spare kinds of thing, for a WAD's rules to make its own of. |
| `rules_actions.h` (new) | What a moment can run, by name, for the rules to name: written from `info.c` by `scripts/gen-rules.mjs`. |
| `p_mobj.c` | Things are looked for among the spare kinds too. A level that places a thing of no kind no longer stops the game: the thing is left out. |
| `r_things.c` | A sprite with a frame or a side missing, a picture misnamed, or one picture where there were eight no longer stops the game: a missing frame isn't drawn, a missing side is shown as one that is there, and the later picture is the one used. |
| `g_game.c`, `f_finale.c` | A WAD that says how many levels it has (`!levels` in `WORDS`) is played straight through that many: nine to an episode with the ninth an ordinary level, then on into the next episode's first, so twelve levels are E1M1 to E1M9 and E2M1 to E2M3. Its ending is the WAD's own words (`!ending`) if it has them. Without `!levels` an episode is as it always was. |
| `p_pspr.c` | The shotgun scatters four times as wide (`A_FireShotgun`): Delbie's lever-action. |
