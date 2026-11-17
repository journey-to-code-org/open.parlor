// Writes what the run found to dist/results.json, for the page at the root of the build
// (src/report/): every check, and how it went in each framework. Also dist/badge.json, in the
// shape shields.io reads for the README's badge.
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/** How one check went in one framework. "known" is a difference already reported upstream. */
type Status = "passed" | "failed" | "known" | "skipped";
interface Cell {
  status: Status;
  /** What the feature is called in this framework (the feature checks only). */
  as?: string;
  /** For "known": the issue it was reported in. */
  note?: string;
}
interface Row {
  title: string;
  cells: Record<string, Cell>;
}

const annotation = (test: TestCase, type: string) => test.annotations.find((a) => a.type === type)?.description;

export default class ResultsReporter implements Reporter {
  private readonly rows = { components: new Map<string, Row>(), features: new Map<string, Row>() };

  onTestEnd(test: TestCase, result: TestResult): void {
    // The last try is the one that counts (CI retries once).
    if (result.retry < test.results.length - 1) return;
    const [, , file = "", framework = ""] = test.titlePath();
    const suite = file.includes("features") ? "features" : "components";
    const title = annotation(test, "check") ?? test.title;
    const known = test.expectedStatus === "failed";
    const status: Status = result.status === "skipped" ? "skipped" : test.outcome() === "unexpected" ? "failed" : known ? "known" : "passed";
    const row = this.rows[suite].get(title) ?? { title, cells: {} };
    row.cells[framework] = { status, as: annotation(test, "as"), note: known ? annotation(test, "fail") : undefined };
    this.rows[suite].set(title, row);
  }

  onEnd(result: FullResult): void {
    const components = [...this.rows.components.values()];
    const features = [...this.rows.features.values()];
    const cells = [...components, ...features].flatMap((row) => Object.values(row.cells));
    const count = (status: Status) => cells.filter((cell) => cell.status === status).length;
    // The package doesn't export its package.json, so find it from the entry point.
    const entry = createRequire(import.meta.url).resolve("@zubra/runtime");
    const runtime = `${entry.slice(0, entry.lastIndexOf("@zubra/runtime") + "@zubra/runtime".length)}/package.json`;
    const results = {
      ranAt: result.startTime.toISOString(),
      zubra: (JSON.parse(readFileSync(runtime, "utf8")) as { version: string }).version,
      commit: process.env.GITHUB_SHA ?? null,
      repository: process.env.GITHUB_REPOSITORY ?? "journey-to-code-org/open.parlor",
      totals: { checks: cells.length, passed: count("passed"), failed: count("failed"), known: count("known") },
      components,
      features,
    };
    const dist = fileURLToPath(new URL("../dist/", import.meta.url));
    mkdirSync(dist, { recursive: true });
    writeFileSync(`${dist}results.json`, JSON.stringify(results, null, 1));
    const { passed, failed, checks } = results.totals;
    const badge = { schemaVersion: 1, label: "Zubra conformance", message: failed ? `${failed} of ${checks} failing` : `${passed} of ${checks} checks pass`, color: failed ? "red" : "brightgreen" };
    writeFileSync(`${dist}badge.json`, JSON.stringify(badge));
  }
}
