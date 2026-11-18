// Sound effects, played by the page (Web Audio). The engine decides what plays, where and how
// loud; the page is handed each effect's lump from the WAD the first time it is needed and keeps
// it decoded after that.
//
// Music is the page's too. The engine says which song (its lump, whole), whether it goes round,
// how loud, and when to stop; the page plays it if it is sound the browser can decode (an MP3,
// an Ogg, a WAV put in the song's place). The songs the game came with are MUS data, which wants
// an OPL or MIDI synthesiser: the page is handed those too, and has nothing to play them with yet.

#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "deh_str.h"
#include "i_sound.h"
#include "m_misc.h"
#include "w_wad.h"
#include "z_zone.h"

#define HOST(name) __attribute__((import_module("host"), import_name(#name)))

// volume is 0 to 127; separation is 0 (left) to 254 (right), 127 in the middle.
HOST(sound_start) void host_sound_start(int channel, int lump, const void *data, int length, int volume, int separation);
HOST(sound_update) void host_sound_update(int channel, int volume, int separation);
HOST(sound_stop) void host_sound_stop(int channel);
HOST(sound_playing) int host_sound_playing(int channel);
// volume is 0 to 127.
HOST(music_play) void host_music_play(const void *data, int length, int looping);
HOST(music_stop) void host_music_stop(void);
HOST(music_volume) void host_music_volume(int volume);
HOST(music_pause) void host_music_pause(int paused);

static boolean use_prefix;

static snddevice_t sound_devices[] = {
    SNDDEVICE_SB, SNDDEVICE_PAS, SNDDEVICE_GUS, SNDDEVICE_WAVEBLASTER,
    SNDDEVICE_SOUNDCANVAS, SNDDEVICE_AWE32,
};

static boolean Sound_Init(boolean use_sfx_prefix)
{
    use_prefix = use_sfx_prefix;
    return true;
}

static void Sound_Shutdown(void) {}

static int Sound_GetSfxLumpNum(sfxinfo_t *sfx)
{
    char name[9];

    if (sfx->link != NULL)
    {
        sfx = sfx->link;
    }

    if (use_prefix)
    {
        M_snprintf(name, sizeof(name), "ds%s", DEH_String(sfx->name));
    }
    else
    {
        M_StringCopy(name, DEH_String(sfx->name), sizeof(name));
    }

    // A sound the WAD's rules name and the WAD hasn't got is silence, not the end of the game.
    return W_CheckNumForName(name);
}

static void Sound_Update(void) {}

static void Sound_UpdateParams(int channel, int volume, int separation)
{
    host_sound_update(channel, volume, separation);
}

static int Sound_Start(sfxinfo_t *sfx, int channel, int volume, int separation)
{
    int lump = sfx->lumpnum;
    int length = lump < 0 ? 0 : W_LumpLength(lump);

    if (length <= 8)
    {
        return -1;
    }

    // PU_CACHE: the zone may take the memory back once the page has had its look.
    host_sound_start(channel, lump, W_CacheLumpNum(lump, PU_CACHE), length, volume, separation);
    return channel;
}

static void Sound_Stop(int channel)
{
    host_sound_stop(channel);
}

static boolean Sound_IsPlaying(int channel)
{
    return host_sound_playing(channel) != 0;
}

static void Sound_Cache(sfxinfo_t *sounds, int count)
{
    (void) sounds;
    (void) count;
}

sound_module_t DG_sound_module = {
    sound_devices,
    sizeof(sound_devices) / sizeof(*sound_devices),
    Sound_Init,
    Sound_Shutdown,
    Sound_GetSfxLumpNum,
    Sound_Update,
    Sound_UpdateParams,
    Sound_Start,
    Sound_Stop,
    Sound_IsPlaying,
    Sound_Cache,
};

// A song the engine has asked to have ready: where it is and how long.
typedef struct
{
    void *data;
    int length;
} song_t;

static song_t song;
static boolean music_playing;

static boolean Music_Init(void) { return true; }
static void Music_Shutdown(void) { host_music_stop(); }
static void Music_SetVolume(int volume) { host_music_volume(volume); }
static void Music_Pause(void) { host_music_pause(1); }
static void Music_Resume(void) { host_music_pause(0); }

// One song at a time is all the engine asks for.
static void *Music_Register(void *data, int length)
{
    song.data = data;
    song.length = length;
    return &song;
}

static void Music_Unregister(void *handle) { (void) handle; }

static void Music_Play(void *handle, boolean looping)
{
    song_t *asked = handle;

    if (asked == NULL || asked->length <= 0)
        return;
    host_music_play(asked->data, asked->length, looping ? 1 : 0);
    music_playing = true;
}

static void Music_Stop(void)
{
    host_music_stop();
    music_playing = false;
}

static boolean Music_IsPlaying(void) { return music_playing; }
static void Music_Poll(void) {}

music_module_t DG_music_module = {
    NULL,
    0,
    Music_Init,
    Music_Shutdown,
    Music_SetVolume,
    Music_Pause,
    Music_Resume,
    Music_Register,
    Music_Unregister,
    Music_Play,
    Music_Stop,
    Music_IsPlaying,
    Music_Poll,
};
