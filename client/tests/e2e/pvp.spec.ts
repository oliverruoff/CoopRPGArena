import { expect, test } from "@playwright/test";


test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:8000/debug/pvp/action", { data: { action: "reset_match", payload: {} } });
});


test("pvp has an isolated team and ten-point lobby at /pvp", async ({ page }) => {
  await page.goto("/pvp");
  await expect(page.getByTestId("pvp-lobby")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Klingenklamm" })).toBeVisible();
  await page.getByTestId("team-blue").click();
  await page.getByTestId("pvp-class-mage").click();
  await page.getByRole("button", { name: "Attribute" }).click();
  for (let i = 0; i < 10; i++) await page.getByTestId("pvp-stat-max_health").click();
  await expect(page.locator("#pointsUsed")).toHaveText("10");
  await expect(page.getByTestId("pvp-ready")).toBeEnabled();
  const scene = await page.getByTestId("pvp-arena").evaluate((canvas: HTMLCanvasElement) => {
    const babylonScene = (canvas as unknown as { scene?: { getMeshByName(name: string): unknown } }).scene;
    return {
      bridge: Boolean(babylonScene?.getMeshByName("high-bridge")),
      lowerFloor: Boolean(babylonScene?.getMeshByName("lower-arena")),
      pillarLeft: Boolean(babylonScene?.getMeshByName("pillar--8")),
      centralRamp: Boolean(babylonScene?.getMeshByName("center-ramp--7--8.5")),
      cameraInputCount: Object.keys((babylonScene as any)?.activeCamera?.inputs?.attached || {}).length,
      cameraAlpha: (babylonScene as any)?.activeCamera?.alpha,
      cameraBeta: (babylonScene as any)?.activeCamera?.beta,
    };
  });
  expect(scene.bridge).toBe(true);
  expect(scene.lowerFloor).toBe(true);
  expect(scene.pillarLeft).toBe(true);
  expect(scene.centralRamp).toBe(true);
  expect(scene.cameraInputCount).toBe(0);
  expect(scene.cameraAlpha).toBeCloseTo(-Math.PI / 2);
  expect(scene.cameraBeta).toBeCloseTo(0.9);
});


test("one player can start an uneven pvp match against a ready red bot", async ({ page, request }) => {
  await page.goto("/pvp");
  await page.getByTestId("team-blue").click();
  await page.getByTestId("pvp-class-mage").click();
  await page.getByRole("button", { name: "Attribute" }).click();
  for (let i = 0; i < 10; i++) await page.getByTestId("pvp-stat-max_health").click();
  await request.post("http://127.0.0.1:8000/debug/pvp/action", { data: { action: "add_bot", payload: { team: "red", classId: "warrior", name: "Red Bot", ready: true } } });
  await page.getByTestId("pvp-ready").click();
  await expect(page.getByTestId("pvp-countdown")).toContainText("Kampf beginnt", { timeout: 3000 });
  await expect(page.getByTestId("pvp-hud")).toBeVisible({ timeout: 7000 });
  await expect(page.locator("#prepBanner")).toContainText("Tore öffnen");
  await expect(page.locator("#redFrames")).toContainText("Red Bot");
  const pvpState = await (await request.get("http://127.0.0.1:8000/debug/pvp/state")).json();
  expect(pvpState.matchState).toBe("running");
  expect(Object.values<any>(pvpState.players).filter((player) => player.team === "blue")).toHaveLength(1);
  expect(Object.values<any>(pvpState.players).filter((player) => player.team === "red")).toHaveLength(1);
});


test("mobile lobby can configure every required pvp choice without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pvp");
  await expect(page.getByTestId("pvp-lobby")).toBeVisible();

  await page.getByTestId("team-red").click();
  await page.getByTestId("pvp-class-priest").click();
  await page.getByRole("button", { name: "Attribute" }).click();
  for (let i = 0; i < 10; i++) await page.getByTestId("pvp-stat-max_health").click();

  await expect(page.locator("#pointsUsed")).toHaveText("10");
  await expect(page.getByTestId("pvp-ready")).toBeEnabled();
  const layout = await page.evaluate(() => {
    const bounds = (selector: string) => {
      const rect = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    };
    return {
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      lobbyOverflowY: getComputedStyle(document.querySelector<HTMLElement>("#pvpLobby")!).overflowY,
      blue: bounds(".bluePanel"),
      red: bounds(".redPanel"),
      build: bounds(".buildPanel"),
      ready: bounds("#pvpReady"),
    };
  });
  expect(layout.documentWidth).toBe(layout.viewportWidth);
  expect(layout.lobbyOverflowY).toBe("auto");
  expect(layout.blue.width).toBeGreaterThan(170);
  expect(layout.red.width).toBeGreaterThan(170);
  expect(layout.build.width).toBeGreaterThan(350);
  expect(layout.ready.left).toBeGreaterThanOrEqual(0);
  expect(layout.ready.right).toBeLessThanOrEqual(layout.viewportWidth);
});


test("mobile match supports touch movement, enemy targeting, and ability buttons", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pvp");
  await page.getByTestId("team-blue").click();
  await page.getByTestId("pvp-class-mage").click();
  for (const spell of ["mage_fireball", "mage_frostbolt", "mage_frost_nova", "mage_meteor", "mage_arcane_blast"]) {
    await page.getByTestId(`pvp-spell-${spell}`).click();
  }
  await page.getByRole("button", { name: "Attribute" }).click();
  for (let i = 0; i < 5; i++) await page.getByTestId("pvp-stat-max_health").click();

  await request.post("http://127.0.0.1:8000/debug/pvp/action", {
    data: { action: "add_bot", payload: { team: "red", classId: "warrior", name: "Touch Bot", ready: true } },
  });
  await page.getByTestId("pvp-ready").click();
  await expect(page.getByTestId("pvp-hud")).toBeVisible({ timeout: 7000 });
  await expect(page.getByTestId("pvp-mobile-controls")).toBeVisible();
  await expect(page.getByTestId("pvp-ability-slot-1")).toContainText("1");
  await expect(page.getByTestId("pvp-ability-slot-1")).toContainText("Firebolt");
  await expect(page.getByTestId("pvp-ability-slot-5")).toContainText("Q");
  await expect(page.getByTestId("pvp-ability-slot-5")).toContainText("Arcane Blast");
  await expect(page.locator("#prepBanner")).toBeEmpty({ timeout: 7000 });

  const before = await (await request.get("http://127.0.0.1:8000/debug/pvp/state")).json();
  const player = Object.values<any>(before.players).find((candidate) => candidate.team === "blue");
  const bot = Object.values<any>(before.players).find((candidate) => candidate.team === "red");
  const stick = page.getByTestId("pvp-move-stick");
  const stickBox = await stick.boundingBox();
  expect(stickBox).not.toBeNull();
  const centerX = stickBox!.x + stickBox!.width / 2;
  const centerY = stickBox!.y + stickBox!.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX, centerY - stickBox!.height * 0.3, { steps: 4 });
  await page.waitForTimeout(350);
  await page.mouse.up();
  await expect.poll(async () => {
    const current = await (await request.get("http://127.0.0.1:8000/debug/pvp/state")).json();
    return current.players[player.id].position.z;
  }).toBeGreaterThan(player.position.z + 0.5);

  const moved = await (await request.get("http://127.0.0.1:8000/debug/pvp/state")).json();
  const currentPlayer = moved.players[player.id];
  await request.post("http://127.0.0.1:8000/debug/pvp/action", {
    data: { action: "place_player", payload: { playerId: bot.id, x: currentPlayer.position.x + 5, y: currentPlayer.position.y, z: currentPlayer.position.z } },
  });
  await page.getByTestId("pvp-mobile-enemy-target").click();
  await expect(page.locator("#pvpTarget")).toContainText("Touch Bot");
  await page.locator("#actionBar button[data-slot='1']").click();
  await expect(page.locator("#castBar")).toBeVisible();
});
