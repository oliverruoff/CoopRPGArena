import { expect, test } from "@playwright/test";

async function startMage(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("lobby")).toBeVisible();
  await page.getByTestId("class-mage").click();
  await expect(page.getByTestId("class-preview-info")).toContainText("Mage");
  await expect(page.getByTestId("class-preview-info")).toContainText("burns enemies over time");
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("lobby-upgrade-max_health").click();
  }
  await expect(page.getByTestId("lobby-upgrade-points")).toContainText("0");
  await page.getByTestId("ready-button").click();
  await expect(page.getByTestId("wave-counter")).toContainText("Wave 1", { timeout: 14000 });
}

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "reset_match", payload: {} } });
});

test("lobby live stats update when blessings are chosen", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("class-mage").click();
  await expect(page.getByTestId("lobby-stats-toggle")).toBeEnabled();
  await page.getByTestId("lobby-stats-toggle").click();
  const drawer = page.getByTestId("lobby-stats-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Spell Power");
  await expect(drawer).toContainText("0/3");
  await page.getByTestId("lobby-upgrade-max_health").click();
  await expect(drawer).toContainText("1/3");
  await expect(drawer).toContainText("(+12%)");
  await expect(drawer).toContainText("Max Health +12%");
});

test("lobby canvas renders sharply at device pixel resolution", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(page.getByTestId("lobby")).toBeVisible();
    const dimensions = await page.getByTestId("arena").evaluate((canvas: HTMLCanvasElement) => ({
      bufferWidth: canvas.width,
      bufferHeight: canvas.height,
      cssWidth: canvas.getBoundingClientRect().width,
      cssHeight: canvas.getBoundingClientRect().height,
    }));
    expect(dimensions.bufferWidth).toBe(dimensions.cssWidth * 2);
    expect(dimensions.bufferHeight).toBe(dimensions.cssHeight * 2);
    const filters = await page.evaluate(() => ({
      canvas: getComputedStyle(document.querySelector<HTMLCanvasElement>("#renderCanvas")!).filter,
      lobbyBackdrop: getComputedStyle(document.querySelector<HTMLElement>("#lobby")!).backdropFilter,
      classInfoBackdrop: getComputedStyle(document.querySelector<HTMLElement>("#classPreviewInfo")!).backdropFilter,
    }));
    expect(filters).toEqual({ canvas: "none", lobbyBackdrop: "none", classInfoBackdrop: "none" });
    await page.getByTestId("class-mage").click();
    await expect(page.getByTestId("class-preview-info")).toContainText("Mage");
    const lobbyScene = await page.getByTestId("arena").evaluate((canvas: HTMLCanvasElement) => {
      const scene = (canvas as any).scene;
      const pipeline = (canvas as any).lobbyPipeline;
      const scenery = scene.getTransformNodeByName("lobby-scenery");
      return {
        treeCount: scenery.getChildren().filter((node: { name: string }) => /^lobby-tree-\d+$/.test(node.name)).length,
        sceneryEnabled: scenery.isEnabled(),
        blurEnabled: pipeline.depthOfFieldEnabled,
        blurLevel: pipeline.depthOfFieldBlurLevel,
        lensSize: pipeline.depthOfField.lensSize,
        fStop: pipeline.depthOfField.fStop,
      };
    });
    expect(lobbyScene).toEqual({ treeCount: 64, sceneryEnabled: true, blurEnabled: true, blurLevel: 2, lensSize: 120, fStop: 0.9 });
  } finally {
    await context.close();
  }
});

test("mobile lobby keeps class description, blessings, and actions separate", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByTestId("class-mage").click();
  await expect(page.getByTestId("class-preview-info")).toContainText("Mage");
  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const bounds = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom };
    };
    return {
      description: rect("#classPreviewInfo .classInfoHeader"),
      blessings: rect("#lobbyUpgrades"),
      actions: rect(".lobbyActions"),
    };
  });
  expect(layout.description.bottom).toBeLessThanOrEqual(layout.blessings.top);
  expect(layout.blessings.bottom).toBeLessThanOrEqual(layout.actions.top);
});

test("mobile lobby stats can be toggled and reflect blessing choices", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByTestId("class-mage").click();

  const toggle = page.getByTestId("lobby-stats-toggle");
  const drawer = page.getByTestId("lobby-stats-drawer");
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText("Live Stats");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Build progress");
  await expect(drawer).toContainText("0/3");

  await page.getByRole("button", { name: "Close live stats" }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(drawer).toBeHidden();

  await page.getByTestId("lobby-upgrade-max_health").click();
  await toggle.click();
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("1/3");
  await expect(drawer).toContainText("(+12%)");
  await expect(drawer).toContainText("Max Health +12%");
});

test("lobby waits for every player to select a class and ready", async ({ browser }) => {
  const contextOne = await browser.newContext();
  const contextTwo = await browser.newContext();
  const playerOne = await contextOne.newPage();
  const playerTwo = await contextTwo.newPage();
  try {
    await playerOne.goto("/");
    await playerTwo.goto("/");
    await expect(playerOne.getByTestId("ready-button")).toBeDisabled();
    await expect(playerTwo.getByTestId("ready-button")).toBeDisabled();
    await expect(playerOne.getByTestId("class-mage")).not.toHaveClass(/selectedClass/);

    await playerTwo.getByTestId("class-warrior").click();
    for (let i = 0; i < 3; i++) {
      await playerTwo.getByTestId("lobby-upgrade-max_health").click();
    }
    await expect(playerTwo.getByTestId("ready-button")).toBeEnabled();
    await playerTwo.getByTestId("ready-button").click();
    await playerTwo.waitForTimeout(3500);
    await expect(playerTwo.getByTestId("lobby")).toBeVisible();
    await expect(playerTwo.getByTestId("countdown")).toBeEmpty();

    await playerOne.getByTestId("class-mage").click();
    for (let i = 0; i < 3; i++) {
      await playerOne.getByTestId("lobby-upgrade-max_health").click();
    }
    await expect(playerOne.getByTestId("ready-button")).toBeEnabled();
    await playerOne.getByTestId("ready-button").click();
    await expect(playerOne.getByTestId("wave-counter")).toContainText("Wave 1", { timeout: 7000 });
  } finally {
    await Promise.allSettled([contextOne.close(), contextTwo.close()]);
  }
});

test("single player can start, move, target, level, and reach the boss wave", async ({ page, request }) => {
  await startMage(page);
  await expect(page.getByTestId("hp-label")).toContainText("HP");
  await expect(page.getByTestId("resource-label")).toContainText("Mana");
  await expect(page.getByTestId("xp-bar")).toBeAttached();
  await expect(page.getByTestId("auto-attack-bar")).toBeAttached();
  await expect(page.getByTestId("stats-panel")).toContainText("Spell Power");
  const before = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" })));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" })));
  const afterMove = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  const playerId = Object.values<any>(afterMove.players).find((p) => p.classId === "mage").id;
  expect(afterMove.players[playerId].position.z).toBeGreaterThan(before.players[playerId].position.z);

  const playerPosition = afterMove.players[playerId].position;
  const spawn = await (await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "spawn_enemy", payload: { type: "brute", position: { x: playerPosition.x + 0.75, z: playerPosition.z } } } })).json();
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "set_enemy_target", payload: { playerId, targetId: spawn.enemyId } } });
  await expect(page.getByTestId("target-frame")).toContainText("Brute");
  await page.getByTestId("ability-slot-1").hover();
  await expect(page.getByTestId("ability-tooltip")).toContainText("Cost:");
  await expect(page.getByTestId("ability-tooltip")).toContainText("burns");
  await page.getByTestId("ability-slot-1").click();
  await expect(page.getByTestId("cast-bar")).toBeVisible();
  await page.waitForTimeout(1650);
  await expect(page.getByTestId("floating-damage").first()).toBeVisible();
  await expect(page.getByTestId("enemy-hp-bar").first()).toBeVisible();
  const targetEffect = page.getByTestId("target-frame").getByTestId("effect-icon").first();
  await expect(targetEffect).toBeVisible();
  await expect(targetEffect.locator(".effectTimer")).not.toBeEmpty();
  await targetEffect.hover();
  await expect(page.getByTestId("effect-tooltip")).toContainText("Firebolt");
  await expect(page.getByTestId("effect-tooltip")).toContainText("Debuff");
  const damaged = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  expect(damaged.enemies[spawn.enemyId].hp).toBeLessThan(damaged.enemies[spawn.enemyId].maxHealth);

  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "give_xp", payload: { playerId, amount: 120 } } });
  await expect(page.getByTestId("level-up-panel")).toBeVisible();
  const beforeUpgrade = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  const chosenUpgradeText = await page.getByTestId("level-up-panel").getByRole("button").first().innerText();
  await page.getByTestId("level-up-panel").getByRole("button").first().click();
  await expect(page.getByTestId("level-up-panel")).toBeHidden();
  const afterUpgrade = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  if (chosenUpgradeText.includes("Health")) expect(afterUpgrade.players[playerId].stats.maxHealth).toBeGreaterThan(beforeUpgrade.players[playerId].stats.maxHealth);
  else if (chosenUpgradeText.includes("Max Resource")) expect(afterUpgrade.players[playerId].stats.maxResource).toBeGreaterThan(beforeUpgrade.players[playerId].stats.maxResource);
  else if (chosenUpgradeText.includes("Attack Power")) expect(afterUpgrade.players[playerId].stats.attackPower).toBeGreaterThan(beforeUpgrade.players[playerId].stats.attackPower);
  else if (chosenUpgradeText.includes("Spell Power")) expect(afterUpgrade.players[playerId].stats.spellPower).toBeGreaterThan(beforeUpgrade.players[playerId].stats.spellPower);
  else if (chosenUpgradeText.includes("Move Speed")) expect(afterUpgrade.players[playerId].stats.moveSpeed).toBeGreaterThan(beforeUpgrade.players[playerId].stats.moveSpeed);
  else if (chosenUpgradeText.includes("Crit")) expect(afterUpgrade.players[playerId].stats.critChance).toBeGreaterThan(beforeUpgrade.players[playerId].stats.critChance);
  else if (chosenUpgradeText.includes("Resource Costs")) expect(afterUpgrade.players[playerId].stats.resourceCostMultiplier).toBeLessThan(beforeUpgrade.players[playerId].stats.resourceCostMultiplier);
  else if (chosenUpgradeText.includes("Armor")) expect(afterUpgrade.players[playerId].stats.armor).toBeGreaterThan(beforeUpgrade.players[playerId].stats.armor);
  else if (chosenUpgradeText.includes("Resistance")) expect(afterUpgrade.players[playerId].stats.resistance).toBeGreaterThan(beforeUpgrade.players[playerId].stats.resistance);
  else expect(afterUpgrade.players[playerId].stats.resourceRegen).toBeGreaterThan(beforeUpgrade.players[playerId].stats.resourceRegen);

  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "force_wave_start", payload: { waveNumber: 10 } } });
  const bossState = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  const bossId = Object.values<any>(bossState.enemies).find((enemy) => enemy.boss).id;
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "kill_enemy", payload: { enemyId: bossId } } });
  const afterBoss = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  expect(afterBoss.enemies[bossId]).toBeUndefined();
  expect(afterBoss.matchState).toBe("running");
});

test("priest can heal ally and create threat", async ({ browser, request }) => {
  const priest = await browser.newPage();
  const warrior = await browser.newPage();
  await priest.goto("/");
  await warrior.goto("/");
  await priest.getByTestId("class-priest").click();
  for (let i = 0; i < 3; i++) {
    await priest.getByTestId("lobby-upgrade-max_health").click();
  }
  await warrior.getByTestId("class-warrior").click();
  for (let i = 0; i < 3; i++) {
    await warrior.getByTestId("lobby-upgrade-max_health").click();
  }
  await priest.getByTestId("ready-button").click();
  await warrior.getByTestId("ready-button").click();
  await expect(priest.getByTestId("wave-counter")).toContainText("Wave 1", { timeout: 7000 });
  const state = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  const priestId = Object.values<any>(state.players).find((p) => p.classId === "priest").id;
  const warriorId = Object.values<any>(state.players).find((p) => p.classId === "warrior").id;
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "spawn_enemy", payload: { type: "goblin", position: { x: 3, z: 0 } } } });
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "set_player_hp", payload: { playerId: warriorId, hp: 40 } } });
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "set_ally_target", payload: { playerId: priestId, targetId: warriorId } } });
  await priest.waitForTimeout(200);
  await priest.getByTestId("ability-slot-1").click();
  await expect(priest.getByTestId("cast-bar")).toBeVisible();
  await priest.waitForTimeout(1650);
  await expect(priest.getByTestId("floating-heal").first()).toBeVisible();
  const after = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  expect(after.players[warriorId].hp).toBeGreaterThan(40);
  const enemy: any = Object.values(after.enemies)[0];
  expect(enemy.threat[priestId]).toBeGreaterThan(0);
  await priest.close();
  await warrior.close();
});

test("rogue can backstep and vanish from enemies", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByTestId("lobby")).toBeVisible();
  await page.getByTestId("class-rogue").click();
  await expect(page.getByTestId("class-preview-info")).toContainText("Rogue");
  await expect(page.getByTestId("class-preview-info")).toContainText("Backstep");
  await expect(page.getByTestId("class-preview-info")).toContainText("Vanish");
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("lobby-upgrade-max_health").click();
  }
  await page.getByTestId("ready-button").click();
  await expect(page.getByTestId("wave-counter")).toContainText("Wave 1", { timeout: 14000 });

  const started = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  const playerId = Object.values<any>(started.players).find((p) => p.classId === "rogue").id;
  const spawn = await (await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "spawn_enemy", payload: { type: "brute", position: { x: 6, z: 0 } } } })).json();
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "set_enemy_target", payload: { playerId, targetId: spawn.enemyId } } });
  await page.waitForTimeout(200);

  await page.getByTestId("ability-slot-1").hover();
  await expect(page.getByTestId("ability-tooltip")).toContainText("Backstep");
  await page.getByTestId("ability-slot-1").click();
  await page.waitForTimeout(250);
  const afterBackstep = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  const rogue = afterBackstep.players[playerId];
  const enemy = afterBackstep.enemies[spawn.enemyId];
  const forward = { x: Math.sin(enemy.facing), z: Math.cos(enemy.facing) };
  const enemyToRogue = { x: rogue.position.x - enemy.position.x, z: rogue.position.z - enemy.position.z };
  expect(enemy.hp).toBeLessThan(enemy.maxHealth);
  expect(forward.x * enemyToRogue.x + forward.z * enemyToRogue.z).toBeLessThan(0);

  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "give_xp", payload: { playerId, amount: 120 } } });
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "choose_upgrade", payload: { playerId, upgradeId: "learn:rogue_vanish" } } });
  await page.waitForTimeout(1100);
  await page.getByTestId("ability-slot-2").click();
  await page.waitForTimeout(250);
  const vanished = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  expect(vanished.players[playerId].stealthed).toBe(true);
  expect(vanished.enemies[spawn.enemyId].targetId).not.toBe(playerId);
  expect(vanished.enemies[spawn.enemyId].threat[playerId] || 0).toBe(0);
});

test("druid can shift into bear and cat forms", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByTestId("lobby")).toBeVisible();
  await page.getByTestId("class-druid").click();
  await expect(page.getByTestId("class-preview-info")).toContainText("Druid");
  await expect(page.getByTestId("class-preview-info")).toContainText("Bear Form");
  await expect(page.getByTestId("class-preview-info")).toContainText("Cat Form");
  await expect(page.getByTestId("class-preview-info")).not.toContainText("Humanoid Form");
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("lobby-upgrade-max_health").click();
  }
  await page.getByTestId("ready-button").click();
  await expect(page.getByTestId("wave-counter")).toContainText("Wave 1", { timeout: 14000 });

  const started = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  const playerId = Object.values<any>(started.players).find((p) => p.classId === "druid").id;
  const base = started.players[playerId];
  expect(base.abilities).toEqual(["druid_moonfire"]);
  expect(base.abilitySlots.druid_moonfire).toBe(1);

  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "give_xp", payload: { playerId, amount: 120 } } });
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "choose_upgrade", payload: { playerId, upgradeId: "learn:druid_bear_form" } } });
  await page.waitForTimeout(250);
  await page.getByTestId("ability-slot-2").click();
  await page.waitForTimeout(250);
  const bear = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  expect(bear.players[playerId].form).toBe("bear");
  expect(bear.players[playerId].stats.armor).toBeGreaterThan(base.stats.armor);
  expect(bear.players[playerId].maxHealth).toBeGreaterThan(base.maxHealth);

  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "give_xp", payload: { playerId, amount: 180 } } });
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "choose_upgrade", payload: { playerId, upgradeId: "learn:druid_cat_form" } } });
  await page.waitForTimeout(1000);
  await page.getByTestId("ability-slot-3").click();
  await page.waitForTimeout(250);
  const cat = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  expect(cat.players[playerId].form).toBe("cat");
  expect(cat.players[playerId].stats.moveSpeed).toBeGreaterThan(base.stats.moveSpeed);
  expect(cat.players[playerId].stats.autoAttackInterval).toBeLessThan(base.stats.autoAttackInterval);

  await page.waitForTimeout(1000);
  await page.getByTestId("ability-slot-3").click();
  await page.waitForTimeout(250);
  const humanoid = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  expect(humanoid.players[playerId].form).toBeNull();
  expect(humanoid.players[playerId].stats.moveSpeed).toBeCloseTo(base.stats.moveSpeed, 4);
});

test("arrow barrage keeps rendering with a reduced arrow count", async ({ page, request }) => {
  await page.goto("/");
  await page.getByTestId("class-hunter").click();
  for (let i = 0; i < 3; i++) await page.getByTestId("lobby-upgrade-max_health").click();
  await page.getByTestId("ready-button").click();
  await expect(page.getByTestId("wave-counter")).toContainText("Wave 1", { timeout: 14000 });

  const started = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  const playerId = Object.values<any>(started.players).find((player) => player.classId === "hunter").id;
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "give_xp", payload: { playerId, amount: 600 } } });
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "choose_upgrade", payload: { playerId, upgradeId: "learn:hunter_arrow_barrage" } } });
  const barrageButton = page.locator('[data-ability-id="hunter_arrow_barrage"]');
  await expect(barrageButton).toContainText("Arrow Barrage");

  await barrageButton.click();
  await expect(page.locator("#target .targetSummary")).toContainText("Tap arena to place Arrow Barrage");
  await page.getByTestId("arena").click({ position: { x: 520, y: 360 } });
  await expect.poll(async () => (await (await request.get("http://127.0.0.1:8000/debug/state")).json()).groundEffects.length).toBeGreaterThan(0);

  const renderResult = await page.getByTestId("arena").evaluate(async (canvas: HTMLCanvasElement) => {
    const scene = (canvas as any).scene;
    let frames = 0;
    const observer = scene.onAfterRenderObservable.add(() => frames++);
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    scene.onAfterRenderObservable.remove(observer);
    return {
      frames,
      arrows: scene.meshes.filter((mesh: { name: string; parent?: { metadata?: { effectType?: string } } }) => mesh.parent?.metadata?.effectType === "volley" && /-arrow-\d+$/.test(mesh.name)).length,
    };
  });
  expect(renderResult.frames).toBeGreaterThan(5);
  expect(renderResult.arrows).toBe(11);
});

test("desktop stats panel stays expanded across live updates", async ({ page }) => {
  await startMage(page);
  const panel = page.getByTestId("stats-panel");
  const toggle = page.locator("#statsToggle");
  const content = page.locator("#statsContent");

  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toHaveClass(/expanded/);
  await expect(content).toBeVisible();
  await expect(content).toContainText("Max HP");

  await page.waitForTimeout(500);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(content).toBeVisible();
});

test("mobile actions work with a second pointer while joystick movement continues", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startMage(page);
  const initial = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  const playerId = Object.values<any>(initial.players).find((player) => player.classId === "mage").id;

  const compactBars = await page.evaluate(() => ({
    xp: document.querySelector<HTMLElement>(".bar.xp")!.getBoundingClientRect().height,
    swing: document.querySelector<HTMLElement>(".bar.swing")!.getBoundingClientRect().height,
    labels: document.querySelectorAll("#xpLabel, #swingLabel").length,
  }));
  expect(compactBars).toEqual({ xp: 5, swing: 5, labels: 0 });
  await page.locator(`[data-testid="party-frame"][data-id="${playerId}"]`).click();
  await page.waitForTimeout(120);
  const afterSelfTap = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  expect(afterSelfTap.players[playerId].allyTargetId).toBeNull();

  await page.evaluate(() => {
    const stick = document.querySelector<HTMLElement>("#moveStick")!;
    const rect = stick.getBoundingClientRect();
    stick.dispatchEvent(new PointerEvent("pointerdown", {
      pointerId: 11, pointerType: "touch", isPrimary: true, bubbles: true,
      clientX: rect.left + rect.width / 2, clientY: rect.top + 8,
    }));
  });
  await page.waitForTimeout(220);
  const moving = await (await request.get("http://127.0.0.1:8000/debug/state")).json();

  await page.evaluate(() => {
    document.querySelector<HTMLElement>("#cycleEnemy")!.dispatchEvent(new PointerEvent("pointerdown", {
      pointerId: 22, pointerType: "touch", isPrimary: false, bubbles: true,
    }));
  });
  await page.waitForTimeout(260);
  const afterTarget = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  expect(afterTarget.players[playerId].targetId).toBeTruthy();
  expect(afterTarget.players[playerId].position.z).toBeGreaterThan(moving.players[playerId].position.z);
  const targetMarker = page.getByTestId("enemy-hp-bar").filter({ hasText: "TARGET" });
  await expect(targetMarker).toHaveClass(/targetedEnemy/);
  await expect(targetMarker).toContainText("TARGET");
  const targetId = afterTarget.players[playerId].targetId;
  await expect.poll(() => page.evaluate((id) => {
    const canvas = document.querySelector<HTMLCanvasElement>("#renderCanvas") as any;
    const arrow = canvas.scene.getTransformNodeByName(`${id}-target-arrow`);
    return Boolean(arrow && arrow.getChildMeshes().some((mesh: any) => mesh.name.endsWith("-target-arrow-head")) && arrow.getChildMeshes().some((mesh: any) => mesh.name.endsWith("-target-arrow-shaft")));
  }, targetId)).toBe(true);

  await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>("#jump")!;
    const touch = new Touch({ identifier: 23, target: button, clientX: 0, clientY: 0 });
    button.dispatchEvent(new TouchEvent("touchstart", { touches: [touch], targetTouches: [touch], changedTouches: [touch], bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(80);
  const jumping = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  expect(jumping.players[playerId].jumping).toBe(true);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("#moveStick")!.dispatchEvent(new PointerEvent("pointerup", {
      pointerId: 11, pointerType: "touch", isPrimary: true, bubbles: true,
    }));
  });
});

test("players can set a name and see it in lobby and world", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("lobby")).toBeVisible();
  await expect(page.getByTestId("player-name-input")).toBeVisible();
  const playerName = "Aldric";
  await page.getByTestId("player-name-input").fill(playerName);
  await page.getByTestId("class-mage").click();
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("lobby-upgrade-max_health").click();
  }
  await page.getByTestId("ready-button").click();
  await expect(page.getByTestId("lobby-player")).toContainText(playerName);
  await expect(page.getByTestId("lobby-player")).toContainText("Mage");
  await expect(page.getByTestId("wave-counter")).toContainText("Wave 1", { timeout: 14000 });
  await expect(page.getByTestId("player-name-label")).toContainText(playerName);
});

test("all players dead triggers defeat", async ({ page, request }) => {
  await startMage(page);
  const state = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  const playerId = Object.keys(state.players)[0];
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "kill_player", payload: { playerId } } });
  await expect(page.getByTestId("end-screen")).toContainText("Wipe");
  await page.getByTestId("restart-button").click();
  await expect(page.getByTestId("lobby")).toBeVisible();
  await expect(page.getByTestId("class-mage")).toBeVisible();
  const restarted = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  expect(restarted.matchState).toBe("lobby");
  expect(restarted.players[playerId].classId).toBeNull();
});

test("mage can drag and drop abilities to swap slots", async ({ page, request }) => {
  await startMage(page);
  const before = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  const playerId = Object.values<any>(before.players).find((p) => p.classId === "mage").id;

  const slot1 = page.getByTestId("ability-slot-1");
  const slotE = page.getByTestId("ability-slot-e");
  await expect(slot1).toContainText("Firebolt");
  await expect(slotE).toContainText("E");

  // Chromium's synthetic dragTo can stop after dragover on draggable buttons.
  // Dispatch the native DnD lifecycle with one shared DataTransfer instead.
  await page.evaluate(() => {
    const source = document.querySelector<HTMLElement>('[data-testid="ability-slot-1"]')!;
    const target = document.querySelector<HTMLElement>('[data-testid="ability-slot-e"]')!;
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer }));
  });

  await expect.poll(async () => {
    const after = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
    return after.players[playerId].abilitySlots["mage_fireball"];
  }).toBe(6);

  await expect(slotE).toContainText("Firebolt");
  await expect(slot1).not.toContainText("Firebolt");
});

test("low quality mode renders map objects", async ({ page }) => {
  await page.goto("/?q=low");
  await expect(page.getByTestId("lobby")).toBeVisible();
  await page.getByTestId("class-mage").click();
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("lobby-upgrade-max_health").click();
  }
  await page.getByTestId("ready-button").click();
  await expect(page.getByTestId("wave-counter")).toContainText("Wave 1", { timeout: 14000 });
  await page.waitForTimeout(500);
  const sceneryMeshes = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as any;
    const scene = canvas?.scene;
    return scene ? scene.meshes.filter((m: any) => /tree|rock/.test(m.name?.toLowerCase())).length : 0;
  });
  expect(sceneryMeshes).toBeGreaterThan(0);
});
