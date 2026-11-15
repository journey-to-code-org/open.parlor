// "Report a problem", on every screen: a small button, and the sheet it opens. The sheet is
// @journey-to-code/relay-ui's, dressed in the parlor's own styles and Zubra's switch; the parlor keeps
// its words and its corner button.
import ToggleSwitch from "@open-parlor/ui/zubra-ui/toggle-switch.zb";
import { ReportButton, ReportSheet, useFlow, type ReportCopy, type ToggleProps } from "@journey-to-code/relay-ui/react";
import { useEffect } from "react";
import { openReport, reportFlow, sheetClasses } from "./bugReport";

/** Whether this parlor takes reports (false until the server has said so). */
export function useReports() {
  useEffect(() => void reportFlow.load(), []);
  return useFlow(reportFlow).enabled;
}

/**
 * "Report a problem" as a line in another sheet (a table's ⚙︎, where a phone has no spare corner for
 * the button). `before` closes that sheet, so the picture is of the table and not of the settings.
 */
export function ReportLink({ before }: { before: () => void }) {
  if (!useReports()) return null;
  return (
    <button
      type="button"
      className="link report-link"
      onClick={() => {
        before();
        // Once the sheet has left the screen.
        setTimeout(openReport, 60);
      }}
    >
      🐞 Something not working? Report a problem
    </button>
  );
}

/** zubra-ui's switch, as the sheet's toggle. */
const Toggle = ({ label, description, checked, onChange }: ToggleProps) => (
  <ToggleSwitch label={label} description={description} checked={checked} onCheckedChange={(e: CustomEvent<boolean>) => onChange(e.detail)} />
);

const copy: Partial<ReportCopy> = {
  placeholder: "The cards didn't deal, a button did nothing, something looked off…",
  shotDescription: "The screen as it was when you tapped the bug. Look it over: names and chat on it are sent too.",
  finePrint:
    "Reports are posted where anyone can read them, so the people who work on open.parlor can fix things. Yours also says which game and screen you were on and any errors the page ran into. It never includes your name.",
  done: "Back to the game",
};

export function ReportProblem() {
  return (
    <>
      <ReportButton flow={reportFlow} className="report-toggle" copy={copy} />
      <ReportSheet flow={reportFlow} classes={sheetClasses} slots={{ Toggle }} copy={copy} />
    </>
  );
}
