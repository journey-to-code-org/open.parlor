// The browser side of the engine: what doomgeneric asks of a platform (a frame, a clock, the
// keys), answered by functions the page provides, and the functions the page calls to start the
// game, run a frame of it and hand it input.
//
// The module is a WASI "reactor": nothing runs until the page calls web_start, and after that the
// page calls web_frame once for each frame it wants to show. Nothing in here may wait: the browser
// only draws when the call has returned.

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "d_event.h"
#include "doomgeneric.h"
#include "doomkeys.h"
#include "d_loop.h"
#include "d_player.h"
#include "d_ticcmd.h"
#include "doomstat.h"
#include "hu_stuff.h"
#include "m_controls.h"
#include "m_random.h"
#include "net_client.h"
#include "net_defs.h"
#include "p_local.h"
#include "st_stuff.h"

#define HOST(name) __attribute__((import_module("host"), import_name(#name)))
#define EXPORT(name) __attribute__((export_name(#name)))

// The frame is width x height pixels of four bytes each: red, green, blue, 255.
HOST(draw_frame) void host_draw_frame(const void *pixels, int width, int height);
HOST(now_ms) uint32_t host_now_ms(void);
HOST(set_title) void host_set_title(const char *title, int length);
// This device's command for a tic, in a game with other devices: `size` bytes to send them.
HOST(net_send) void host_net_send(int tic, const void *command, int size);

void doomgeneric_Tick(void);

// Keys wait here between the page's events and the engine's next look.
#define KEYS 64
static uint16_t key_queue[KEYS];
static unsigned key_write, key_read;

// What a thumb-stick and a swipe are asking for right now, in the engine's own units; g_game.c
// adds them to each tic's command. See web_analog.
int web_forward, web_side, web_turn;

void DG_Init(void) {}

void DG_DrawFrame(void)
{
    host_draw_frame(DG_ScreenBuffer, DOOMGENERIC_RESX, DOOMGENERIC_RESY);
}

// The engine sleeps to pass time. A page can't: it returns, and is called again next frame.
void DG_SleepMs(uint32_t ms)
{
    (void) ms;
}

uint32_t DG_GetTicksMs(void)
{
    return host_now_ms();
}

int DG_GetKey(int *pressed, unsigned char *key)
{
    if (key_read == key_write)
    {
        return 0;
    }

    uint16_t data = key_queue[key_read];
    key_read = (key_read + 1) % KEYS;
    *pressed = data >> 8;
    *key = data & 0xff;
    return 1;
}

void DG_SetWindowTitle(const char *title)
{
    host_set_title(title, (int) strlen(title));
}

// Memory for the page to write into (the command line).
EXPORT(web_alloc) void *web_alloc(int bytes)
{
    return malloc((size_t) bytes);
}

// Starts the engine with a command line, as main() would. Returns once the first frame is drawn.
EXPORT(web_start) void web_start(int argc, char **argv)
{
    // Keys for the previous and next weapon, which the engine leaves unset: a touch screen has
    // no number row. (Before the settings are read, so a saved choice still wins.)
    key_prevweapon = '[';
    key_nextweapon = ']';

    doomgeneric_Create(argc, argv);
}

// What the player is looking at, so the page can make its controls fit:
//   bit 0  a menu is up
//   bit 1  a game of the player's own is on: a level, or the screens between levels (not the
//          title screens, not a demo)
//   bit 2  the map is up
//   bit 3  the game is paused
//   bit 4  a question is up that wants a yes or a no
//   bit 5  the engine is reading no input: the screen is wiping from one thing to the next, or
//          the engine has only just started and has nothing on the screen yet
EXPORT(web_state) int web_state(void)
{
    extern int messageToPrint;
    extern boolean messageNeedsInput;
    extern boolean wipe_running;

    boolean own = usergame && !demoplayback
               && (gamestate == GS_LEVEL || gamestate == GS_INTERMISSION || gamestate == GS_FINALE);
    // Before its first tic the engine says it is in a level, with no game and no demo.
    boolean starting = gamestate == GS_LEVEL && !usergame && !demoplayback;

    return (menuactive ? 1 : 0)
         | (own ? 2 : 0)
         | (automapactive ? 4 : 0)
         | (paused ? 8 : 0)
         | (messageToPrint && messageNeedsInput ? 16 : 0)
         | (wipe_running || starting ? 32 : 0)
         // The game is over: its ending is on the screen.
         | (gamestate == GS_FINALE ? 64 : 0);
}

// One frame: any game tics that have come due, then the picture.
EXPORT(web_frame) void web_frame(void)
{
    doomgeneric_Tick();
}

// A key going down (1) or up (0). The key is one of doomkeys.h, or a lower-case ASCII character.
EXPORT(web_key) void web_key(int pressed, int key)
{
    unsigned next = (key_write + 1) % KEYS;

    if (next == key_read)
    {
        return;
    }

    key_queue[key_write] = (uint16_t) (((pressed ? 1 : 0) << 8) | (key & 0xff));
    key_write = next;
}

// A mouse: the buttons held (bit 0 left, 1 right, 2 middle) and how far it moved. Movement adds
// up here until the engine next reads its input (web_input), once for each tic: the engine keeps
// only the last mouse event it is given, and a page hears from the mouse far more often than that.
static int mouse_buttons, mouse_sent_buttons, mouse_dx, mouse_dy;

EXPORT(web_mouse) void web_mouse(int buttons, int dx, int dy)
{
    mouse_buttons = buttons;
    mouse_dx += dx;
    mouse_dy += dy;
}

// Called by the engine (I_GetEvent in i_input.c) when it gathers input for a tic.
void web_input(void)
{
    event_t event;

    if (mouse_dx == 0 && mouse_dy == 0 && mouse_buttons == mouse_sent_buttons)
    {
        return;
    }

    event.type = ev_mouse;
    event.data1 = mouse_buttons;
    event.data2 = mouse_dx;
    event.data3 = mouse_dy;
    event.data4 = 0;
    D_PostEvent(&event);
    mouse_sent_buttons = mouse_buttons;
    mouse_dx = mouse_dy = 0;
}

// A thumb-stick, held until the next call. forward and side are the engine's movement units
// (50 is a run forward, 40 a run sideways; negative is back and left). turn is added to the view
// angle every tic: 65536 is a full circle, positive is left.
EXPORT(web_analog) void web_analog(int forward, int side, int turn)
{
    web_forward = forward;
    web_side = side;
    web_turn = turn;
}

// The engine looks for a desktop dialog program to show its errors in. There are no programs to
// run here; the page shows what the engine wrote to stderr instead.
int system(const char *command)
{
    (void) command;
    return -1;
}

// ---------------------------------------------------------------------------------------------
// A game with other devices.
//
// The engine is started with "-net <players> <me>" (engine/d_loop.c). From then on it hands the
// page its own command for each tic (host.net_send) and runs a tic only when the page has given
// it everyone's (web_net_tic). Every device runs the same game from the same commands; nothing
// else travels. A device that watches is given the tics and sends none.

void D_ReceiveTic(ticcmd_t *ticcmds, boolean *players_mask);
int D_NetBacklog(void);

// Called by the engine (BuildNewTic in d_loop.c) with each command it makes.
void web_net_send(ticcmd_t *command, int tic)
{
    host_net_send(tic, command, (int) sizeof(*command));
}

// How many bytes a command is.
EXPORT(web_net_command_size) int web_net_command_size(void)
{
    return (int) sizeof(ticcmd_t);
}

// One tic: a command for each of the four players, one after another, and which of them are in
// the game (bit 0 the first player). Tics are given in order, starting from the first.
EXPORT(web_net_tic) void web_net_tic(const ticcmd_t *commands, int playing)
{
    ticcmd_t all[NET_MAXPLAYERS];
    boolean in[NET_MAXPLAYERS];
    int i;

    memset(all, 0, sizeof(all));

    for (i = 0; i < NET_MAXPLAYERS; i++)
    {
        in[i] = i < MAXPLAYERS && ((playing >> i) & 1);

        if (i < MAXPLAYERS)
        {
            all[i] = commands[i];
        }
    }

    D_ReceiveTic(all, in);
}

// How many tics have been given and not run yet. There is room for BACKUPTICS (128).
// [open.wasm] A device that has been watching becomes player `slot` at tic `at` (d_loop.c): the
// room has said so, and has put them in the game from that tic for everyone.
void D_NetJoin(int slot, int at);
extern int web_join_view;

EXPORT(web_net_join) void web_net_join(int slot, int at)
{
    D_NetJoin(slot, at);
    web_join_view = slot;
}

EXPORT(web_net_backlog) int web_net_backlog(void)
{
    return D_NetBacklog();
}

// How many tics the game has run.
EXPORT(web_tics) int web_tics(void)
{
    return gametic;
}

// Which players are in the game (bit 0 the first player).
EXPORT(web_players) int web_players(void)
{
    int i, playing = 0;

    for (i = 0; i < MAXPLAYERS; i++)
    {
        playing |= playeringame[i] ? 1 << i : 0;
    }

    return playing;
}

// For a device that watches: whose eyes to look through. The picture, the status bar, the
// messages and the sounds become that player's. Nothing in the game itself depends on which
// player a device shows, which is what lets every device run the same game.
EXPORT(web_view) void web_view(int player)
{
    if (!drone || player < 0 || player >= MAXPLAYERS || !playeringame[player] || player == consoleplayer)
    {
        return;
    }

    consoleplayer = displayplayer = player;

    if (gamestate == GS_LEVEL)
    {
        ST_Start();
        HU_Start();
    }
}

// A number made from everything that moves in the level. Two devices that have run the same
// tics have the same number; if they ever differ, the games have come apart.
EXPORT(web_checksum) uint32_t web_checksum(void)
{
    extern int prndindex;
    uint32_t hash = 2166136261u;
    thinker_t *thinker;

#define MIX(value) hash = (hash ^ (uint32_t) (value)) * 16777619u
    MIX(gametic);
    MIX(gamestate);
    MIX(prndindex);

    if (gamestate == GS_LEVEL)
    {
        MIX(leveltime);

        for (thinker = thinkercap.next; thinker != &thinkercap; thinker = thinker->next)
        {
            if (thinker->function.acp1 == (actionf_p1) P_MobjThinker)
            {
                mobj_t *thing = (mobj_t *) thinker;

                MIX(thing->type);
                MIX(thing->x);
                MIX(thing->y);
                MIX(thing->z);
                MIX(thing->angle);
                MIX(thing->health);
            }
        }
    }
#undef MIX

    return hash;
}
