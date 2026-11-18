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
#include "doomstat.h"
#include "m_controls.h"

#define HOST(name) __attribute__((import_module("host"), import_name(#name)))
#define EXPORT(name) __attribute__((export_name(#name)))

// The frame is width x height pixels of four bytes each: red, green, blue, 255.
HOST(draw_frame) void host_draw_frame(const void *pixels, int width, int height);
HOST(now_ms) uint32_t host_now_ms(void);
HOST(set_title) void host_set_title(const char *title, int length);

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
         | (wipe_running || starting ? 32 : 0);
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
