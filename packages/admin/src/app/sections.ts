// The admin app's parts: a tab each, and a page at /admin/<value>.
export const SECTIONS = [
  { value: "overview", label: "Overview" },
  { value: "tables", label: "Tables" },
  { value: "players", label: "Players" },
  { value: "houses", label: "Houses" },
  { value: "games", label: "Games" },
  { value: "designs", label: "Card designs" },
  { value: "courses", label: "Courses & lanes" },
  { value: "shootout", label: "Road to the Shootout" },
  { value: "activity", label: "Activity" },
] as const;
