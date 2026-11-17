// Sound effects, played by the page (Web Audio). The engine decides what plays, where and how
// loud; the page is handed each effect's lump from the WAD the first time it is needed and keeps
// it decoded after that.
//
// Music is not played yet: the songs are MUS data that wants an OPL or MIDI synthesiser. The
// module below accepts the engine's calls and does nothing with them.

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

    return W_GetNumForName(name);
}

static void Sound_Update(void) {}

static void Sound_UpdateParams(int channel, int volume, int separation)
{
    host_sound_update(channel, volume, separation);
}

static int Sound_Start(sfxinfo_t *sfx, int channel, int volume, int separation)
{
    int lump = sfx->lumpnum;
    int length = W_LumpLength(lump);

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

static boolean Music_Init(void) { return true; }
static void Music_Shutdown(void) {}
static void Music_SetVolume(int volume) { (void) volume; }
static void Music_Pause(void) {}
static void Music_Resume(void) {}
static void *Music_Register(void *data, int length) { (void) length; return data; }
static void Music_Unregister(void *handle) { (void) handle; }
static void Music_Play(void *handle, boolean looping) { (void) handle; (void) looping; }
static void Music_Stop(void) {}
static boolean Music_IsPlaying(void) { return false; }
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
