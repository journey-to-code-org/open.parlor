// Zubra's motion module, as the parlor's boards use it (Snakes & Ladders' hops, Ludo's pieces):
// `glide` animates an element from where it was to where a change puts it, and under reduced
// motion makes the change without animating. Checked on the page with no framework, since glide
// works on elements whatever drew them.
import { expect, test } from "@playwright/test";

const running = (page: import("@playwright/test").Page) => page.locator('[data-t="glide-box"]').evaluate((box) => box.getAnimations().length);
const left = (page: import("@playwright/test").Page) => page.locator('[data-t="glide-box"]').evaluate((box) => (box as HTMLElement).style.left);

test("glide animates an element from where it was to where it is", async ({ page }) => {
  await page.goto("/element/");
  await page.locator('[data-t="glide"]').click();
  expect(await left(page)).toBe("200px");
  expect(await running(page)).toBeGreaterThan(0);
  // And it ends where the change put it.
  await expect.poll(() => running(page)).toBe(0);
  const box = await page.locator('[data-t="glide-box"]').boundingBox();
  const track = await page.locator('[data-t="glide-track"]').boundingBox();
  expect(Math.round(box!.x - track!.x)).toBe(200);
});

test("glide makes the change without animating when less motion is asked for", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/element/");
  await page.locator('[data-t="glide"]').click();
  expect(await left(page)).toBe("200px");
  expect(await running(page)).toBe(0);
});
