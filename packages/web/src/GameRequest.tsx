// "Ask for a game": a line in the front page's footer opens this sheet. A game's name and, if they
// like, a note; the parlor files the request on GitHub for them. The sheet is
// @journey-to-code/relay-ui's, dressed in the parlor's own styles and Zubra's text field. A game the
// parlor already has needs no request, so it says so instead.
import TextField from "@open-parlor/ui/zubra-ui/text-field.zb";
import { createRequestFlow } from "@journey-to-code/relay-ui";
import { RequestSheet, type RequestCopy, type TextFieldProps } from "@journey-to-code/relay-ui/react";
import { relay, sheetClasses } from "./bugReport";
import { arranged } from "./catalogue";
import { EVERY_GAME } from "./GamePicker";

/** A game's name with only its letters and digits, so "Gin rummy" finds "Gin Rummy". */
const plainName = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const requests = createRequestFlow(relay, { findExisting: (name) => arranged(EVERY_GAME).find((g) => plainName(g.name) === plainName(name)) });

/** Open the sheet from anywhere (the front page's footer). */
export const openGameRequest = () => requests.open();

/** zubra-ui's text field, as the sheet's. */
const Field = ({ label, value, placeholder, maxLength, required, onChange }: TextFieldProps) => (
  <TextField label={label} required={required} maxlength={maxLength} value={value} placeholder={placeholder} onValueChange={(e: CustomEvent<string>) => onChange(e.detail)} />
);

const copy: Partial<RequestCopy> = {
  title: "Ask for a game",
  nameLabel: "Which game?",
  namePlaceholder: "Backgammon, Skat, Mexican Train…",
  notePlaceholder: "How your family plays it, how many players, a rule you can't do without…",
  finePrint: "Requests are posted where anyone can read them, so the people who work on open.parlor can see what to build next. Yours never includes your name.",
  done: "Back to the games",
};

export function GameRequest() {
  return (
    <RequestSheet
      flow={requests}
      classes={sheetClasses}
      slots={{ TextField: Field }}
      copy={copy}
      renderExisting={(game) => (
        <>
          Good news: {game.emoji} {game.name} is already here. It's on the front page.
        </>
      )}
    />
  );
}
