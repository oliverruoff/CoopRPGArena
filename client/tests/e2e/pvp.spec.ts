import { expect, test } from "@playwright/test";

test.setTimeout(90_000);

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:8000/debug/pvp/action", { data: { action: "reset_match", payload: {} } });
});

async function selectMageBuild(page: any, spellCount = 0) {
  await page.getByTestId("pvp-class-mage").click();
  const spells = ["mage_fireball", "mage_frostbolt", "mage_frost_nova", "mage_meteor", "mage_arcane_blast"];
  for (const [index, spell] of spells.slice(0, spellCount).entries()) {
    await page.getByTestId(`pvp-spell-${spell}`).click();
    await expect(page.locator("#pvpPointsUsed")).toHaveText(String(index + 1));
  }
  await page.getByRole("button", { name: "Attributes" }).click();
  for (let index = spellCount; index < 10; index++) {
    await page.getByTestId("pvp-stat-max_health").click();
    await expect(page.locator("#pvpPointsUsed")).toHaveText(String(index + 1));
  }
}

test("desktop lobby uses explicit team controls and the shared arena", async ({ page }) => {
  await page.goto("/pvp");
  await expect(page.getByRole("heading", { name: "Blade Gorge" })).toBeVisible();
  await page.getByTestId("team-blue").click();
  await selectMageBuild(page, 5);
  await expect(page.locator("#pvpPointsUsed")).toHaveText("10");
  await expect(page.getByTestId("pvp-stat-max_health")).toContainText("+8% Health per point");
  await page.getByTestId("pvp-live-stats").click();
  await expect(page.locator("#pvpStatsContent")).toContainText("10/10");
  await expect(page.locator("#pvpStatsContent")).toContainText("Health");
  await expect(page.getByTestId("team-blue")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Ready to fight")).toBeVisible();
  await expect(page.getByTestId("pvp-ready")).toBeEnabled();
  await expect(page.getByTestId("arena")).toBeAttached();
  await expect(page.evaluate(() => document.documentElement.scrollWidth)).resolves.toBeLessThanOrEqual(1280);
});

test("arena floor and rim share the forty-point jagged contour", async ({ page, request }) => {
  await page.goto("/pvp");
  await expect(page.getByTestId("arena")).toBeAttached();

  await expect.poll(() => page.evaluate(() => {
    const scene = (document.querySelector("#renderCanvas") as any).scene;
    return {
      floorVertices: scene.getMeshByName("lower-arena")?.getTotalVertices(),
      ledges: scene.meshes.filter((mesh: any) => mesh.name.startsWith("rim-ledge-")).length,
      spikes: scene.meshes.filter((mesh: any) => mesh.name.startsWith("rim-spike-")).length,
    };
  })).toEqual({ floorVertices: 41, ledges: 40, spikes: 40 });

  const serverState = await (await request.get("http://127.0.0.1:8000/debug/pvp/state")).json();
  const clientBoundary = await page.evaluate(() => {
    const scene = (document.querySelector("#renderCanvas") as any).scene;
    const positions = Array.from(scene.getMeshByName("lower-arena").getVerticesData("position") as number[]);
    const points = [];
    for (let index = 3; index < positions.length; index += 3) points.push({ x: positions[index], z: positions[index + 2] });
    return points;
  });
  expect(clientBoundary).toHaveLength(serverState.arena.boundary.length);
  clientBoundary.forEach((point, index) => {
    expect(point.x).toBeCloseTo(serverState.arena.boundary[index].x, 2);
    expect(point.z).toBeCloseTo(serverState.arena.boundary[index].z, 2);
  });
});

test("resource-starved PvP spells disable and recover like co-op spells", async ({ page, request }) => {
  await page.goto("/pvp");
  await page.getByTestId("pvp-add-bot").click();
  await selectMageBuild(page, 5);
  await page.getByTestId("pvp-ready").click();
  await expect(page.locator("#hud")).toBeVisible({ timeout: 15_000 });

  const snapshot = await (await request.get("http://127.0.0.1:8000/debug/pvp/state")).json();
  const player = Object.values<any>(snapshot.players).find((candidate) => !candidate.isBot && candidate.classId === "mage");
  await request.post("http://127.0.0.1:8000/debug/pvp/action", {
    data: { action: "set_player_resource", payload: { playerId: player.id, resource: 0 } },
  });

  const slot = page.getByTestId("ability-slot-1");
  await expect(slot).toHaveClass(/insufficientResource/);
  await expect(slot).toHaveAttribute("title", /\d+(?:\.\d)? more Mana required/);
  await slot.click();
  await expect(page.getByTestId("ability-tooltip")).toBeVisible();
  await expect(page.getByTestId("ability-tooltip")).toContainText(/Unavailable: \d+(?:\.\d)? more Mana required/);

  await request.post("http://127.0.0.1:8000/debug/pvp/action", {
    data: { action: "set_player_resource", payload: { playerId: player.id, resource: player.maxResource } },
  });
  await expect(slot).not.toHaveClass(/insufficientResource/);
  await expect(slot).toHaveAttribute("title", "");
});

test("adding a bot before choosing a team still starts a desktop match", async ({ page, request }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/pvp");
  await page.getByTestId("pvp-add-bot").click();
  await selectMageBuild(page, 5);
  await expect(page.getByTestId("team-blue")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Training Bot", { exact: true })).toBeVisible();
  await page.getByTestId("pvp-ready").click();
  await expect(page.getByTestId("pvp-countdown")).toContainText("Battle begins", { timeout: 3000 });
  await expect(page.locator("#hud")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("action-bar")).toBeVisible();
  await expect(page.getByTestId("target-frame")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const scene = (document.querySelector("#renderCanvas") as any).scene;
    const mage = scene.transformNodes.find((node: any) => node.metadata?.classId === "mage" && node.metadata?.entityId);
    const names = mage?.getChildMeshes().map((mesh: any) => mesh.name) || [];
    return {
      source: mage?.metadata?.modelSource,
      hasHatBrim: names.some((name: string) => name.endsWith("-hat-brim")),
      hasSpellbook: names.some((name: string) => name.endsWith("-spellbook")),
    };
  })).toEqual({ source: "shared-class-model", hasHatBrim: true, hasSpellbook: true });
  await expect.poll(() => page.evaluate(() => {
    const scene = (document.querySelector("#renderCanvas") as any).scene;
    return {
      leftEndRamp: Boolean(scene.getMeshByName("end-ramp--22")),
      rightEndRamp: Boolean(scene.getMeshByName("end-ramp-22")),
      centerRamps: scene.meshes.filter((mesh: any) => mesh.name.startsWith("center-ramp-")).length,
      rimSpikes: scene.meshes.filter((mesh: any) => mesh.name.startsWith("rim-spike-")).length,
      rimLedges: scene.meshes.filter((mesh: any) => mesh.name.startsWith("rim-ledge-")).length,
      boundaryFloorVertices: scene.getMeshByName("lower-arena")?.getTotalVertices(),
      braziers: scene.meshes.filter((mesh: any) => mesh.name.startsWith("brazier-bowl-")).length,
    };
  })).toEqual({ leftEndRamp: false, rightEndRamp: false, centerRamps: 4, rimSpikes: 40, rimLedges: 40, boundaryFloorVertices: 41, braziers: 8 });
  await expect.poll(() => page.evaluate(() => (document.querySelector("#renderCanvas") as any).scene.activeCamera.radius)).toBe(60);
  await page.waitForTimeout(5200);
  const match = await (await request.get("http://127.0.0.1:8000/debug/pvp/state")).json();
  const opponent = Object.values<any>(match.players).find((player) => player.name === "Training Bot" && !player.disconnected);
  const human = Object.values<any>(match.players).find((player) => player.classId === "mage" && player.team === "blue" && !player.disconnected);
  await request.post("http://127.0.0.1:8000/debug/pvp/action", { data: { action: "set_target", payload: { playerId: human.id, targetId: opponent.id } } });
  await expect.poll(async () => {
    const snapshot = await (await request.get("http://127.0.0.1:8000/debug/pvp/state")).json();
    return snapshot.players[human.id]?.targetId;
  }).toBe(opponent.id);
  const opponentBar = page.getByTestId("enemy-hp-bar").filter({ hasText: "TARGET" });
  await expect(opponentBar).toBeVisible();
  await expect(opponentBar).toHaveClass(/pvpEnemyPlayer/);
  await request.post("http://127.0.0.1:8000/debug/pvp/action", { data: { action: "place_player", payload: { playerId: human.id, x: 0, y: 0, z: 8 } } });
  await request.post("http://127.0.0.1:8000/debug/pvp/action", { data: { action: "place_player", payload: { playerId: opponent.id, x: 1, y: 0, z: 8 } } });
  const beforeCast = await (await request.get("http://127.0.0.1:8000/debug/pvp/state")).json();
  const opponentHpBeforeCast = beforeCast.players[opponent.id].hp;
  await request.post("http://127.0.0.1:8000/debug/pvp/action", { data: { action: "cast_ability", payload: { playerId: human.id, slot: 1 } } });
  await expect.poll(async () => {
    const snapshot = await (await request.get("http://127.0.0.1:8000/debug/pvp/state")).json();
    return snapshot.players[opponent.id]?.hp;
  }, { timeout: 10_000 }).toBeLessThan(opponentHpBeforeCast);
  const before = await page.evaluate((humanId) => {
    const scene = (document.querySelector("#renderCanvas") as any).scene;
    return scene.transformNodes.find((node: any) => node.metadata?.entityId === humanId)?.position.x;
  }, human.id);
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(700);
  await page.keyboard.up("KeyD");
  await expect.poll(() => page.evaluate((humanId) => {
    const scene = (document.querySelector("#renderCanvas") as any).scene;
    return scene.transformNodes.find((node: any) => node.metadata?.entityId === humanId)?.position.x;
  }, human.id)).toBeGreaterThan(before + 1);
  await request.post("http://127.0.0.1:8000/debug/pvp/action", { data: { action: "set_player_hp", payload: { playerId: opponent.id, hp: 0 } } });
  await expect(page.getByTestId("end-screen")).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId("end-screen")).toContainText("Victory");
  const framesBefore = await page.evaluate(() => new Promise<number>((resolve) => requestAnimationFrame(() => requestAnimationFrame((time) => resolve(time)))));
  const framesAfter = await page.evaluate(() => new Promise<number>((resolve) => requestAnimationFrame(() => requestAnimationFrame((time) => resolve(time)))));
  expect(framesAfter).toBeGreaterThan(framesBefore);
  expect(pageErrors).toEqual([]);
});

test("mobile lobby and match fit without swiping and remain fully playable", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pvp");
  const mobileTeams = page.locator(".pvpMobileTeams");
  await expect(mobileTeams).toBeVisible();
  await expect(mobileTeams.getByRole("button", { name: "Join Blue" })).toBeVisible();
  await expect(mobileTeams.getByRole("button", { name: "Join Red" })).toBeVisible();
  await mobileTeams.getByRole("button", { name: "Join Blue" }).click();
  await selectMageBuild(page, 5);
  await page.getByTestId("pvp-add-bot").click();

  const layout = await page.evaluate(() => ({
    width: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    gridDisplay: getComputedStyle(document.querySelector(".pvpUnifiedGrid")!).display,
    teamDisplay: getComputedStyle(document.querySelector(".pvpMobileTeams")!).display,
    ready: document.querySelector("#pvpReady")!.getBoundingClientRect().toJSON(),
  }));
  expect(layout.documentWidth).toBe(layout.width);
  expect(layout.gridDisplay).toBe("flex");
  expect(layout.teamDisplay).toBe("grid");
  expect(layout.ready.left).toBeGreaterThanOrEqual(0);
  expect(layout.ready.right).toBeLessThanOrEqual(layout.width);

  await page.getByTestId("pvp-ready").click();
  await expect(page.locator("#hud")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("mobile-controls")).toBeVisible();
  await expect(page.getByTestId("move-stick")).toBeVisible();
  await expect(page.getByTestId("jump-button")).toBeVisible();
  await expect(page.getByTestId("cycle-enemy-button")).toBeVisible();
  const pvpState = await (await request.get("http://127.0.0.1:8000/debug/pvp/state")).json();
  const human = Object.values<any>(pvpState.players).find((player) => !player.isBot && player.classId === "mage");
  expect({ abilities: human?.abilities, abilitySlots: human?.abilitySlots, build: human?.build }).toMatchObject({ abilities: expect.any(Array), abilitySlots: expect.any(Object) });
  expect(human.abilities.length).toBeGreaterThan(0);
  const slotOne = page.getByTestId("ability-slot-1");
  const slotThree = page.getByTestId("ability-slot-3");
  await expect(slotOne).not.toContainText("Empty");
  const firstSpell = await slotOne.locator(".abilityName").textContent();
  const thirdSpell = await slotThree.locator(".abilityName").textContent();
  await slotOne.dragTo(slotThree);
  await expect(slotOne.locator(".abilityName")).toHaveText(thirdSpell!);
  await expect(slotThree.locator(".abilityName")).toHaveText(firstSpell!);
});
