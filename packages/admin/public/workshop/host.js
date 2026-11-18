// What the workshop needs to know about this parlor. The workshop itself comes from
// journey-to-code-org/wasm-toolkit (see packages/wasm/scripts/update-shootout.mjs); this file is
// the parlor's own, and is why a pack made here can be put in front of everyone who plays.
//
// The workshop is opened from the admin app, in a tab of its own, and so has that tab's sign-in:
// the admin token, kept in sessionStorage and nowhere else.
const token = () => {
  try {
    return sessionStorage.getItem("cardroom.admin.token") ?? "";
  } catch {
    return "";
  }
};

export default {
  // The game's own files: the engine, the page that plays it, and the pack being played now.
  base: new URL("../../wasm/shootout/", location.href).href,
  publishLabel: "Publish to the parlor",
  publishAsk: "Put this pack in front of everyone who plays Road to the Shootout here?",
  publishDone: "Published. Everyone who opens Road to the Shootout now plays this pack.",
  async publish(bytes) {
    if (!token()) throw new Error("You are not signed in here. Sign in to the admin app, and open the workshop from its Road to the Shootout section.");
    let response;
    try {
      response = await fetch(new URL("../../moderation/shootout/pack", location.href), { method: "POST", headers: { authorization: `Bearer ${token()}`, "content-type": "application/octet-stream" }, body: bytes, credentials: "omit", cache: "no-store" });
    } catch {
      throw new Error("Couldn't reach the parlor. Check your connection and try again.");
    }
    const answer = await response.json().catch(() => null);
    if (!response.ok) throw new Error(answer?.error ?? `The parlor answered ${response.status}.`);
  },
};
