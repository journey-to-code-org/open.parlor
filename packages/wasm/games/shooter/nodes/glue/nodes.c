// BSP, as something a page can call.
//
// The page puts a WAD on the disk as in.wad, calls nodes_build, and reads out.wad: the same WAD
// with every level's SEGS, SSECTORS, NODES, REJECT and BLOCKMAP built from its walls. BSP is a
// command-line program, so this is its main() called with the words that would have been typed.
// When BSP gives up it says why on stderr and calls exit(), which the page sees as the call
// throwing. A module is used once: BSP keeps what it is doing in globals.
#define EXPORT(name) __attribute__((export_name(#name)))

int bsp_main(int argc, char *argv[]);

EXPORT(nodes_build)
int nodes_build(void)
{
    char *argv[] = { "bsp", "-q", "in.wad", "-o", "out.wad", 0 };
    return bsp_main(5, argv);
}
