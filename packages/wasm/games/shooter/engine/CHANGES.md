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
