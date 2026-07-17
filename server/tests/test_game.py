import asyncio
import math
import time

from app.game import Game, Player


def test_mitigation_reduces_damage():
    assert round(Game._mitigate(100, 100), 2) == 50


def test_trees_and_tubes_block_line_of_sight():
    game = Game()
    game.map_objects = [
        {"id": "tree_1", "type": "tree", "x": 2, "z": 0, "radius": 0.9, "blocksSight": True},
        {"id": "tube_2", "type": "tube", "x": 2, "z": 2, "radius": 0.7, "blocksSight": True},
    ]
    assert game._line_of_sight_blocked_locked(0, 0, 4, 0)
    assert game._line_of_sight_blocked_locked(0, 2, 4, 2)
    assert not game._line_of_sight_blocked_locked(0, 4, 4, 4)


def test_generated_arena_only_contains_trees_and_rocks():
    game = Game()
    game._generate_map_locked()
    assert game.map_objects
    assert {item["type"] for item in game.map_objects} == {"tree", "rock"}
    assert all(item.get("blocksSight") for item in game.map_objects)
    assert 27 <= sum(item["type"] == "tree" for item in game.map_objects) <= 36


def test_player_can_explicitly_target_self():
    async def run():
        game = Game()
        player = await game.add_player("Self Target")
        await game.handle_message(player.id, {"type": "select_target", "targetId": player.id})
        assert player.ally_target_id == player.id
        assert player.target_id is None

    asyncio.run(run())


def test_xp_at_threshold_levels_and_resets_the_bar():
    async def run():
        game = Game()
        player = await game.add_player("Level Up")
        await game.handle_message(player.id, {"type": "select_class", "classId": "mage"})
        game._give_xp_locked(player, 100)
        assert player.level == 2
        assert player.xp == 0

    asyncio.run(run())


def test_xp_carries_over_across_multiple_levels():
    async def run():
        game = Game()
        player = await game.add_player("Multi Level")
        await game.handle_message(player.id, {"type": "select_class", "classId": "mage"})
        game._give_xp_locked(player, 300)
        assert player.level == 3
        assert player.xp == 20

    asyncio.run(run())


def test_every_class_starts_with_exactly_one_ability():
    game = Game()
    assert all(len(class_data["startingAbilities"]) == 1 for class_data in game.classes.values())


def test_arcane_blast_only_uses_global_cooldown():
    ability = Game().abilities["mage_arcane_blast"]
    assert ability["cooldown"] == 0
    assert ability["globalCooldown"] is True


def test_every_class_has_a_resource_cost_baseline():
    game = Game()
    assert all(class_data["baseStats"]["resourceCostMultiplier"] == 1 for class_data in game.classes.values())


def test_druid_forms_toggle_back_to_humanoid_and_can_switch_directly():
    game = Game()
    player = Player(id="druid", name="Druid", class_id="druid")
    player.base_stats = dict(game.classes["druid"]["baseStats"])
    player.stats = dict(player.base_stats)
    player.hp = player.stats["maxHealth"]

    bear = game.abilities["druid_bear_form"]["effects"][0]
    cat = game.abilities["druid_cat_form"]["effects"][0]

    game._apply_shapeshift_locked(player, bear)
    assert player.shapeshift_form == "bear"
    assert player.stats["armor"] > player.base_stats["armor"]
    game._apply_shapeshift_locked(player, bear)
    assert player.shapeshift_form is None
    assert all(math.isclose(player.stats[stat], value) for stat, value in player.base_stats.items())

    game._apply_shapeshift_locked(player, cat)
    assert player.shapeshift_form == "cat"
    assert player.stats["moveSpeed"] > player.base_stats["moveSpeed"]
    game._apply_shapeshift_locked(player, bear)
    assert player.shapeshift_form == "bear"
    game._apply_shapeshift_locked(player, bear)
    assert player.shapeshift_form is None
    assert all(math.isclose(player.stats[stat], value) for stat, value in player.base_stats.items())


def test_shaman_learned_spell_is_assigned_to_next_free_slot_and_snapshotted():
    asyncio.run(_shaman_learned_spell_is_assigned_to_next_free_slot_and_snapshotted())


async def _shaman_learned_spell_is_assigned_to_next_free_slot_and_snapshotted():
    game = Game()
    shaman = await game.add_player()
    await game.handle_message(shaman.id, {"type": "select_class", "classId": "shaman"})
    async with game._lock:
        game._start_match_locked()
        player = game.players[shaman.id]
        assert player.abilities == ["shaman_lightning_bolt"]
        assert player.ability_slots == {"shaman_lightning_bolt": 1}
        player.pending_upgrades = game._level_choices_locked(player)
        game._choose_upgrade_locked(player, "learn:shaman_healing_wave")
        assert player.ability_slots["shaman_healing_wave"] == 2
    snapshot = await game.snapshot(shaman.id)
    assert snapshot["players"][shaman.id]["abilities"] == ["shaman_lightning_bolt", "shaman_healing_wave"]
    assert snapshot["players"][shaman.id]["abilitySlots"]["shaman_healing_wave"] == 2


def test_lobby_start_and_spawn_enemy():
    asyncio.run(_lobby_start_and_spawn_enemy())


def test_lobby_requires_all_players_selected_and_ready():
    asyncio.run(_lobby_requires_all_players_selected_and_ready())


async def _lobby_start_and_spawn_enemy():
    game = Game()
    p = await game.add_player()
    await game.handle_message(p.id, {"type": "select_class", "classId": "mage"})
    await _spend_lobby_upgrades(game, p.id)
    await game.handle_message(p.id, {"type": "ready", "ready": True})
    async with game._lock:
        game._start_match_locked()
    state = await game.snapshot(p.id)
    assert state["matchState"] == "running"
    assert state["players"][p.id]["classId"] == "mage"
    assert state["enemies"]


async def _lobby_requires_all_players_selected_and_ready():
    game = Game()
    mage = await game.add_player()
    unclassed = await game.add_player()
    assert mage.class_id is None
    assert unclassed.class_id is None
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    await _spend_lobby_upgrades(game, mage.id)
    await game.handle_message(mage.id, {"type": "ready", "ready": True})
    await game.handle_message(unclassed.id, {"type": "ready", "ready": True})
    async with game._lock:
        assert game.countdown_until is None
        game._start_match_locked()
    state = await game.snapshot(mage.id)
    assert state["matchState"] == "lobby"
    assert unclassed.id in state["players"]
    await game.handle_message(unclassed.id, {"type": "select_class", "classId": "warrior"})
    await _spend_lobby_upgrades(game, unclassed.id)
    await game.handle_message(unclassed.id, {"type": "ready", "ready": True})
    async with game._lock:
        assert game.countdown_until is not None
    late_joiner = await game.add_player()
    async with game._lock:
        assert late_joiner.class_id is None
        assert game.countdown_until is None


async def _spend_lobby_upgrades(game: Game, player_id: str) -> None:
    for _ in range(3):
        await game.handle_message(player_id, {"type": "choose_lobby_upgrade", "upgradeId": "max_health"})


def test_healing_creates_threat():
    asyncio.run(_healing_creates_threat())


async def _healing_creates_threat():
    game = Game()
    priest = await game.add_player()
    warrior = await game.add_player()
    await game.handle_message(priest.id, {"type": "select_class", "classId": "priest"})
    await game.handle_message(warrior.id, {"type": "select_class", "classId": "warrior"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 3, "z": 0})
        w = game.players[warrior.id]
        w.hp = 40
        pr = game.players[priest.id]
        pr.ally_target_id = warrior.id
        pr.x = 0
        pr.z = 0
        w.x = 1
        w.z = 0
        game._cast_ability_locked(pr, 1)
        assert pr.casting is not None
        pr.casting["endAt"] = 0
        casting = pr.casting
        pr.casting = None
        game._finish_cast_locked(pr, casting["abilityId"], casting["targetId"], started_cast=True)
        assert w.hp > 40
        assert enemy.threat[priest.id] > 0


def test_movement_cancels_cast():
    asyncio.run(_movement_cancels_cast())


async def _movement_cancels_cast():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game.map_objects.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 3, "z": 0})
        m = game.players[mage.id]
        m.x = 0
        m.z = 0
        m.target_id = enemy.id
        game._cast_ability_locked(m, 1)
        assert m.casting is not None
    await game.handle_message(mage.id, {"type": "input", "movement": {"up": True}})
    state = await game.snapshot(mage.id)
    assert state["players"][mage.id]["casting"] is None
    assert state["players"][mage.id]["globalCooldown"] == 0
    assert state["enemies"][enemy.id]["hp"] == state["enemies"][enemy.id]["maxHealth"]


def test_cast_time_spell_gcd_starts_then_does_not_restart_on_finish():
    asyncio.run(_cast_time_spell_gcd_starts_then_does_not_restart_on_finish())


async def _cast_time_spell_gcd_starts_then_does_not_restart_on_finish():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game.map_objects.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 3, "z": 0})
        player = game.players[mage.id]
        player.pending_upgrades = game._level_choices_locked(player)
        game._choose_upgrade_locked(player, "learn:mage_frostbolt")
        player.resource = 100
        player.x = 0
        player.z = 0
        player.target_id = enemy.id
        game._cast_ability_locked(player, player.ability_slots["mage_frostbolt"])
        assert player.casting["abilityId"] == "mage_frostbolt"
        assert player.global_cooldown_until > 0
        player.global_cooldown_until = 0
        player.casting["endAt"] = 0
        game._tick_players_locked(1, 0)
        assert player.casting is None
        assert player.global_cooldown_until == 0
        game._cast_ability_locked(player, 1)
        assert player.casting["abilityId"] == "mage_fireball"


def test_same_spell_recast_does_not_restart_cast():
    asyncio.run(_same_spell_recast_does_not_restart_cast())


async def _same_spell_recast_does_not_restart_cast():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game.map_objects.clear()
        enemy = game.spawn_enemy_locked("goblin", {"x": 3, "z": 0})
        player = game.players[mage.id]
        player.x = 0
        player.z = 0
        player.resource = 100
        player.target_id = enemy.id
        game._cast_ability_locked(player, 1)
        first_end = player.casting["endAt"]
        player.casting["endAt"] -= 0.5
        game._cast_ability_locked(player, 1)
        assert player.casting["endAt"] == first_end - 0.5


def test_duplicate_upgrade_selection_does_not_stack():
    asyncio.run(_duplicate_upgrade_selection_does_not_stack())


async def _duplicate_upgrade_selection_does_not_stack():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        player = game.players[mage.id]
        player.pending_upgrades = game.upgrades[:3]
        before = player.stats["maxHealth"]
        game._choose_upgrade_locked(player, "max_health")
        after_once = player.stats["maxHealth"]
        game._choose_upgrade_locked(player, "max_health")
        game._choose_upgrade_locked(player, "max_health")
        assert after_once > before
        assert player.stats["maxHealth"] == after_once


def test_level_up_offers_all_stats_and_unlearned_spells():
    asyncio.run(_level_up_offers_all_stats_and_unlearned_spells())


async def _level_up_offers_all_stats_and_unlearned_spells():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        player = game.players[mage.id]
        assert player.abilities == ["mage_fireball"]
        game._give_xp_locked(player, 100)
        choice_ids = {choice["id"] for choice in player.pending_upgrades}
        assert {upgrade["id"] for upgrade in game.upgrades}.issubset(choice_ids)
        assert {"learn:mage_frostbolt", "learn:mage_frost_nova", "learn:mage_meteor", "learn:mage_arcane_blast"}.issubset(choice_ids)


def test_learning_spell_uses_next_free_slot_and_frost_nova_freezes_area():
    asyncio.run(_learning_spell_uses_next_free_slot_and_frost_nova_freezes_area())


async def _learning_spell_uses_next_free_slot_and_frost_nova_freezes_area():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game.map_objects.clear()
        player = game.players[mage.id]
        player.pending_upgrades = game._level_choices_locked(player)
        game._choose_upgrade_locked(player, "learn:mage_frost_nova")
        assert "mage_frost_nova" in player.abilities
        assert player.ability_slots["mage_frost_nova"] == 2
        assert player.pending_upgrades == []
        before_spell_power = player.stats["spellPower"]
        game._choose_upgrade_locked(player, "resource_efficiency")
        assert player.stats["resourceCostMultiplier"] == 1
        assert player.stats["spellPower"] == before_spell_power
        player.resource = 100
        player.x = 0
        player.z = 0
        near = game.spawn_enemy_locked("goblin", {"x": 2, "z": 0})
        far = game.spawn_enemy_locked("goblin", {"x": 8, "z": 0})
        game._cast_ability_locked(player, player.ability_slots["mage_frost_nova"])
        assert near.stun_until > 0
        assert near.slow_percent == 1.0
        assert far.stun_until == 0


def test_hunter_trap_persists_until_enemy_enters():
    asyncio.run(_hunter_trap_persists_until_enemy_enters())


async def _hunter_trap_persists_until_enemy_enters():
    game = Game()
    hunter = await game.add_player()
    await game.handle_message(hunter.id, {"type": "select_class", "classId": "hunter"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game.map_objects.clear()
        player = game.players[hunter.id]
        player.pending_upgrades = game._level_choices_locked(player)
        game._choose_upgrade_locked(player, "learn:hunter_snare_trap")
        player.resource = 100
        player.x = 0
        player.z = 0
        game._cast_ability_locked(player, player.ability_slots["hunter_snare_trap"])
        assert len(game.ground_effects) == 1
        game._tick_ground_effects_locked(1)
        assert len(game.ground_effects) == 1
        enemy = game.spawn_enemy_locked("goblin", {"x": 1, "z": 0})
        before = enemy.hp
        game._tick_ground_effects_locked(2)
        assert len(game.ground_effects) == 0
        assert enemy.hp < before
        assert enemy.stun_until > 0


def test_hunter_adrenaline_triples_auto_shot_speed_temporarily():
    asyncio.run(_hunter_adrenaline_triples_auto_shot_speed_temporarily())


async def _hunter_adrenaline_triples_auto_shot_speed_temporarily():
    game = Game()
    hunter = await game.add_player()
    await game.handle_message(hunter.id, {"type": "select_class", "classId": "hunter"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game.map_objects.clear()
        player = game.players[hunter.id]
        player.resource = 100
        game._finish_cast_locked(player, "hunter_adrenaline", player.id)
        assert player.auto_attack_haste_multiplier == 3
        assert player.auto_attack_haste_until > 0
        enemy = game.spawn_enemy_locked("goblin", {"x": 5, "z": 0})
        player.x = 0
        player.z = 0
        player.target_id = enemy.id
        player.auto_attack_at = 0
        game._tick_players_locked(1, 0)
        assert round(player.auto_attack_at - 1, 3) == round(player.stats["autoAttackInterval"] / 3, 3)


def test_warrior_whirlwind_ticks_damage_for_three_seconds():
    asyncio.run(_warrior_whirlwind_ticks_damage_for_three_seconds())


async def _warrior_whirlwind_ticks_damage_for_three_seconds():
    game = Game()
    warrior = await game.add_player()
    await game.handle_message(warrior.id, {"type": "select_class", "classId": "warrior"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game.map_objects.clear()
        player = game.players[warrior.id]
        player.pending_upgrades = game._level_choices_locked(player)
        game._choose_upgrade_locked(player, "learn:warrior_whirlwind")
        player.resource = 100
        player.x = 0
        player.z = 0
        enemy = game.spawn_enemy_locked("brute", {"x": 2, "z": 0})
        far = game.spawn_enemy_locked("brute", {"x": 5, "z": 0})
        game._cast_ability_locked(player, player.ability_slots["warrior_whirlwind"])
        assert player.auras
        first_hp = enemy.hp
        player.auras[0]["nextTick"] = 1
        game._tick_player_auras_locked(player, 1)
        after_first_tick = enemy.hp
        assert after_first_tick < first_hp
        assert far.hp == far.max_health
        player.auras[0]["nextTick"] = 1.5
        game._tick_player_auras_locked(player, 1.5)
        assert enemy.hp < after_first_tick


def test_priest_barrier_absorbs_damage_until_removed_or_expired():
    asyncio.run(_priest_barrier_absorbs_damage_until_removed_or_expired())


async def _priest_barrier_absorbs_damage_until_removed_or_expired():
    game = Game()
    priest = await game.add_player()
    await game.handle_message(priest.id, {"type": "select_class", "classId": "priest"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game.map_objects.clear()
        player = game.players[priest.id]
        player.pending_upgrades = game._level_choices_locked(player)
        game._choose_upgrade_locked(player, "learn:priest_barrier")
        player.resource = 100
        before_hp = player.hp
        game._finish_cast_locked(player, "priest_barrier", player.id)
        assert player.shield > 0
        assert player.shield_until > 0
        remaining = game._damage_player_locked(player, 5)
        assert remaining == 0
        assert player.hp == before_hp
        assert player.shield > 0
        remaining = game._damage_player_locked(player, 999)
        assert remaining > 0
        assert player.shield == 0
        assert player.shield_until == 0


def test_mana_cost_and_regen_upgrades_apply():
    asyncio.run(_mana_cost_and_regen_upgrades_apply())


async def _mana_cost_and_regen_upgrades_apply():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        player = game.players[mage.id]
        assert player.stats["resourceRegen"] == 2
        player.pending_upgrades = [u for u in game.upgrades if u["id"] == "resource_efficiency"]
        before_cost = game._ability_cost_locked(player, game.abilities["mage_fireball"])
        game._choose_upgrade_locked(player, "resource_efficiency")
        after_cost = game._ability_cost_locked(player, game.abilities["mage_fireball"])
        assert after_cost == before_cost * 0.85

        player.pending_upgrades = [u for u in game.upgrades if u["id"] == "regen"]
        before_regen = player.stats["resourceRegen"]
        game._choose_upgrade_locked(player, "regen")
        assert player.stats["resourceRegen"] == before_regen * 1.25


def test_max_resource_and_regen_share_the_new_cap():
    asyncio.run(_max_resource_and_regen_share_the_new_cap())


async def _max_resource_and_regen_share_the_new_cap():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        player = game.players[mage.id]
        old_max = player.stats["maxResource"]
        player.resource = old_max - 10
        player.pending_upgrades = [u for u in game.upgrades if u["id"] == "max_resource"]
        game._choose_upgrade_locked(player, "max_resource")

        gained_capacity = player.stats["maxResource"] - old_max
        assert player.resource == old_max - 10 + gained_capacity
        player.resource -= 5
        game._tick_players_locked(time.monotonic(), 1.0)
        assert player.resource == old_max - 15 + gained_capacity + player.stats["resourceRegen"]

        player.resource = player.stats["maxResource"] - 0.5
        game._tick_players_locked(time.monotonic(), 1.0)
        assert player.resource == player.stats["maxResource"]


def test_lobby_max_resource_upgrade_starts_match_full():
    asyncio.run(_lobby_max_resource_upgrade_starts_match_full())


async def _lobby_max_resource_upgrade_starts_match_full():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._choose_lobby_upgrade_locked(game.players[mage.id], "max_resource")
        game._start_match_locked()
        player = game.players[mage.id]
        assert player.stats["maxResource"] > game.classes["mage"]["startingResource"]
        assert player.resource == player.stats["maxResource"]


def test_mage_fireball_dot_and_frostbolt_slow():
    asyncio.run(_mage_fireball_dot_and_frostbolt_slow())


async def _mage_fireball_dot_and_frostbolt_slow():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game.map_objects.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 3, "z": 0})
        player = game.players[mage.id]
        player.x = 0
        player.z = 0
        player.target_id = enemy.id
        game._finish_cast_locked(player, "mage_fireball", enemy.id)
        assert enemy.dots
        hp_after_fireball = enemy.hp
        enemy.dots[0]["nextTick"] = 0
        game._tick_dots_locked(enemy, 1)
        assert enemy.hp < hp_after_fireball
        player.global_cooldown_until = 0
        player.cooldowns = {}
        game._finish_cast_locked(player, "mage_frostbolt", enemy.id)
        assert enemy.slow_percent > 0
        assert enemy.slow_until > 0


def test_active_effect_snapshot_classifies_and_refreshes_effects_per_source():
    asyncio.run(_active_effect_snapshot_classifies_and_refreshes_effects_per_source())


async def _active_effect_snapshot_classifies_and_refreshes_effects_per_source():
    game = Game()
    mage = await game.add_player()
    priest = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    await game.handle_message(priest.id, {"type": "select_class", "classId": "priest"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game.map_objects.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 2, "z": 0})
        caster = game.players[mage.id]
        caster.target_id = enemy.id
        game._finish_cast_locked(caster, "mage_fireball", enemy.id)
        caster.global_cooldown_until = 0
        caster.cooldowns.clear()
        game._finish_cast_locked(caster, "mage_fireball", enemy.id)
        assert len([effect for effect in enemy.active_effects if effect["abilityId"] == "mage_fireball"]) == 1

        healer = game.players[priest.id]
        healer.abilities.append("priest_renew")
        healer.ally_target_id = caster.id
        healer.x = caster.x = 0
        healer.z = caster.z = 0
        game._finish_cast_locked(healer, "priest_renew", caster.id)
        snapshot = game._snapshot_locked(mage.id)
        enemy_effect = snapshot["enemies"][enemy.id]["activeEffects"][0]
        player_effect = snapshot["players"][caster.id]["activeEffects"][0]
        assert enemy_effect["kind"] == "debuff" and enemy_effect["remaining"] > 0
        assert player_effect["kind"] == "buff" and player_effect["abilityId"] == "priest_renew"


def test_global_cooldown_is_exposed_in_snapshot():
    asyncio.run(_global_cooldown_is_exposed_in_snapshot())


async def _global_cooldown_is_exposed_in_snapshot():
    game = Game()
    warrior = await game.add_player()
    await game.handle_message(warrior.id, {"type": "select_class", "classId": "warrior"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 1, "z": 0})
        player = game.players[warrior.id]
        player.x = 0
        player.z = 0
        player.resource = 100
        player.target_id = enemy.id
        game._cast_ability_locked(player, 1)
    state = await game.snapshot(warrior.id)
    assert state["players"][warrior.id]["globalCooldown"] > 0


def test_casters_can_close_range_auto_attack():
    asyncio.run(_casters_can_close_range_auto_attack())


async def _casters_can_close_range_auto_attack():
    game = Game()
    priest = await game.add_player()
    await game.handle_message(priest.id, {"type": "select_class", "classId": "priest"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 1.2, "z": 0})
        player = game.players[priest.id]
        player.x = 0
        player.z = 0
        player.target_id = enemy.id
        player.auto_attack_at = 0
        before = enemy.hp
        game._tick_players_locked(1, 0)
        assert enemy.hp < before
        assert enemy.alerted
        assert enemy.target_id == player.id


def test_auto_attack_timer_only_resets_when_attack_lands():
    asyncio.run(_auto_attack_timer_only_resets_when_attack_lands())


async def _auto_attack_timer_only_resets_when_attack_lands():
    game = Game()
    warrior = await game.add_player()
    await game.handle_message(warrior.id, {"type": "select_class", "classId": "warrior"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 8, "z": 0})
        player = game.players[warrior.id]
        player.x = 0
        player.z = 0
        player.target_id = enemy.id
        player.auto_attack_at = 0
        game._tick_players_locked(1, 0)
        assert player.auto_attack_at == 0


def test_unalerted_enemies_patrol_to_distant_points():
    asyncio.run(_unalerted_enemies_patrol_to_distant_points())


async def _unalerted_enemies_patrol_to_distant_points():
    game = Game()
    player_ref = await game.add_player()
    await game.handle_message(player_ref.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        enemy = game.spawn_enemy_locked("goblin", {"x": 18, "z": 0})
        enemy.wander_until = 0
        game._wander_enemy_locked(enemy, 1, 0.1)
        assert math.hypot(enemy.wander_x - enemy.x, enemy.wander_z - enemy.z) > 1.4


def test_selecting_player_target_clears_enemy_target():
    asyncio.run(_selecting_player_target_clears_enemy_target())


async def _selecting_player_target_clears_enemy_target():
    game = Game()
    priest = await game.add_player()
    warrior = await game.add_player()
    await game.handle_message(priest.id, {"type": "select_class", "classId": "priest"})
    await game.handle_message(warrior.id, {"type": "select_class", "classId": "warrior"})
    async with game._lock:
        game._start_match_locked()
        enemy = game.spawn_enemy_locked("brute", {"x": 2, "z": 0})
    await game.handle_message(priest.id, {"type": "select_target", "targetId": enemy.id})
    await game.handle_message(priest.id, {"type": "select_target", "targetId": warrior.id})
    state = await game.snapshot(priest.id)
    assert state["players"][priest.id]["allyTargetId"] == warrior.id
    assert state["players"][priest.id]["targetId"] is None


def test_shift_tab_cycles_player_targets():
    asyncio.run(_shift_tab_cycles_player_targets())


async def _shift_tab_cycles_player_targets():
    game = Game()
    priest = await game.add_player()
    warrior = await game.add_player()
    await game.handle_message(priest.id, {"type": "select_class", "classId": "priest"})
    await game.handle_message(warrior.id, {"type": "select_class", "classId": "warrior"})
    async with game._lock:
        game._start_match_locked()
        enemy = game.spawn_enemy_locked("brute", {"x": 2, "z": 0})
        game.players[priest.id].target_id = enemy.id
    await game.handle_message(priest.id, {"type": "cycle_target", "ally": True})
    state = await game.snapshot(priest.id)
    assert state["players"][priest.id]["allyTargetId"] == warrior.id
    assert state["players"][priest.id]["targetId"] is None


def test_walls_block_spell_and_enemy_vision():
    asyncio.run(_walls_block_spell_and_enemy_vision())


async def _walls_block_spell_and_enemy_vision():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 0, "z": -4})
        player = game.players[mage.id]
        player.x = 0
        player.z = -8
        player.target_id = enemy.id
        enemy.facing = math.pi
        # Place a wall directly between player and enemy
        game.map_objects.append({"id": "test_wall", "type": "wall", "x": 0, "z": -6, "width": 4.0, "depth": 1.4, "blocksMovement": True, "blocksSight": True})
        before = enemy.hp
        game._finish_cast_locked(player, "mage_fireball", enemy.id)
        assert enemy.hp == before
        assert not game._enemy_can_see_locked(enemy, player)


def test_walls_block_player_movement():
    asyncio.run(_walls_block_player_movement())


async def _walls_block_player_movement():
    game = Game()
    warrior = await game.add_player()
    await game.handle_message(warrior.id, {"type": "select_class", "classId": "warrior"})
    async with game._lock:
        game._start_match_locked()
        player = game.players[warrior.id]
        player.x = 2.5
        player.z = 0.0
        game.map_objects = [{"id": "test_wall", "type": "wall", "x": 5.0, "z": 0.0, "width": 4.0, "depth": 1.4, "blocksMovement": True, "blocksSight": True}]
        player.input = {"up": False, "down": False, "left": False, "right": True}
        for _ in range(60):
            game._tick_players_locked(0, 0.05)
        assert player.x < 3.0


def test_archer_cannot_attack_through_wall_after_acquiring_target():
    game = Game()
    player = game.add_player_locked()
    player.class_id = "warrior"
    player.base_stats = dict(game.classes["warrior"]["baseStats"])
    player.stats = dict(player.base_stats)
    player.x = 0
    player.z = 0
    game.match_state = "running"
    game.enemies.clear()
    archer = game.spawn_enemy_locked("archer", {"x": 0, "z": 6})
    archer.alerted = True
    archer.target_id = player.id
    archer.attack_at = 0
    game.map_objects = [{"id": "cover", "type": "wall", "x": 0, "z": 3, "width": 4.0, "depth": 1.2, "blocksMovement": True, "blocksSight": True}]
    before = player.hp

    game._tick_enemies_locked(time.monotonic(), 0.05)

    assert player.hp == before
    assert archer.z < 6


def test_enemy_attack_targets_attacker_only_when_player_has_no_target():
    game = Game()
    player = game.add_player_locked()
    player.class_id = "warrior"
    player.base_stats = dict(game.classes["warrior"]["baseStats"])
    player.stats = dict(player.base_stats)
    player.hp = player.stats["maxHealth"]
    game.match_state = "running"
    game.enemies.clear()
    attacker = game.spawn_enemy_locked("brute", {"x": 0, "z": 1})
    existing_target = game.spawn_enemy_locked("brute", {"x": 4, "z": 0})
    attacker.alerted = True
    attacker.target_id = player.id
    attacker.attack_at = 0

    game._tick_enemies_locked(time.monotonic(), 0.05)
    assert player.target_id == attacker.id

    player.target_id = existing_target.id
    attacker.attack_at = 0
    game._tick_enemies_locked(time.monotonic(), 0.05)
    assert player.target_id == existing_target.id


def test_enemy_attack_does_not_replace_ally_target():
    game = Game()
    player = game.add_player_locked()
    ally = game.add_player_locked()
    player.class_id = "priest"
    player.base_stats = dict(game.classes["priest"]["baseStats"])
    player.stats = dict(player.base_stats)
    player.hp = player.stats["maxHealth"]
    player.ally_target_id = ally.id
    game.match_state = "running"
    game.enemies.clear()
    attacker = game.spawn_enemy_locked("brute", {"x": 0, "z": 1})
    attacker.alerted = True
    attacker.target_id = player.id
    attacker.attack_at = 0

    game._tick_enemies_locked(time.monotonic(), 0.05)

    assert player.target_id is None
    assert player.ally_target_id == ally.id


def test_set_name_in_lobby():
    asyncio.run(_set_name_in_lobby())


async def _set_name_in_lobby():
    game = Game()
    p = await game.add_player()
    await game.handle_message(p.id, {"type": "set_name", "name": "  Bruna the Brave  "})
    state = await game.snapshot(p.id)
    assert state["players"][p.id]["name"] == "Bruna the Brave"
    # Very long names are truncated to 18 characters.
    await game.handle_message(p.id, {"type": "set_name", "name": "A" * 40})
    state = await game.snapshot(p.id)
    assert state["players"][p.id]["name"] == "A" * 18


def test_restart_after_defeat_returns_players_to_lobby():
    asyncio.run(_restart_after_defeat_returns_players_to_lobby())


def test_late_joiner_during_match_becomes_spectator():
    asyncio.run(_late_joiner_during_match_becomes_spectator())


def test_spectator_is_not_targeted_by_enemies_or_counted_for_end_states():
    asyncio.run(_spectator_is_not_targeted_by_enemies_or_counted_for_end_states())


def test_match_restarts_automatically_after_defeat_and_keeps_spectator():
    asyncio.run(_match_restarts_automatically_after_defeat_and_keeps_spectator())


async def _late_joiner_during_match_becomes_spectator():
    game = Game()
    p = await game.add_player()
    await game.handle_message(p.id, {"type": "select_class", "classId": "mage"})
    await _spend_lobby_upgrades(game, p.id)
    await game.handle_message(p.id, {"type": "ready", "ready": True})
    async with game._lock:
        game._start_match_locked()
    spectator = await game.add_player()
    state = await game.snapshot(spectator.id)
    assert state["matchState"] == "running"
    assert state["players"][spectator.id]["spectator"] is True
    assert state["players"][spectator.id]["classId"] is None
    # Spectators should be ignored by enemy targeting.
    async with game._lock:
        game.enemies.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 3, "z": 0})
        enemy.alerted = True
    await game.tick()
    assert enemy.target_id != spectator.id


async def _spectator_is_not_targeted_by_enemies_or_counted_for_end_states():
    game = Game()
    player = await game.add_player()
    await game.handle_message(player.id, {"type": "select_class", "classId": "mage"})
    await _spend_lobby_upgrades(game, player.id)
    await game.handle_message(player.id, {"type": "ready", "ready": True})
    async with game._lock:
        game._start_match_locked()
    spectator = await game.add_player()
    async with game._lock:
        game.players[player.id].hp = 0
        game.players[player.id].dead = True
        game._check_end_states_locked()
    assert game.match_state == "defeat"
    # A live active player should prevent defeat even when a spectator is present.
    game2 = Game()
    active = await game2.add_player()
    await game2.handle_message(active.id, {"type": "select_class", "classId": "warrior"})
    await _spend_lobby_upgrades(game2, active.id)
    await game2.handle_message(active.id, {"type": "ready", "ready": True})
    async with game2._lock:
        game2._start_match_locked()
    await game2.add_player()
    async with game2._lock:
        game2.players[active.id].hp = 0
        game2.players[active.id].dead = True
        game2._check_end_states_locked()
    assert game2.match_state == "defeat"


async def _match_restarts_automatically_after_defeat_and_keeps_spectator():
    game = Game()
    player = await game.add_player()
    await game.handle_message(player.id, {"type": "select_class", "classId": "mage"})
    await _spend_lobby_upgrades(game, player.id)
    await game.handle_message(player.id, {"type": "ready", "ready": True})
    async with game._lock:
        game._start_match_locked()
    spectator = await game.add_player()
    async with game._lock:
        game.players[player.id].hp = 0
        game.players[player.id].dead = True
        game._check_end_states_locked()
        assert game.match_state == "defeat"
    # Match should stay in defeat until a player clicks restart.
    await game.tick()
    assert game.match_state == "defeat"
    await game.handle_message(player.id, {"type": "restart_match"})
    assert game.match_state == "lobby"
    assert game.players[spectator.id].spectator is True
    assert game.players[player.id].class_id is None


async def _restart_after_defeat_returns_players_to_lobby():
    game = Game()
    p = await game.add_player()
    await game.handle_message(p.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        player = game.players[p.id]
        player.hp = 0
        player.dead = True
        game._check_end_states_locked()
    await game.handle_message(p.id, {"type": "restart_match"})
    state = await game.snapshot(p.id)
    assert state["matchState"] == "lobby"
    assert state["players"][p.id]["classId"] is None
    assert state["players"][p.id]["ready"] is False
    assert state["enemies"] == {}


def test_uncleared_wave_timer_adds_next_wave_and_keeps_positions():
    asyncio.run(_uncleared_wave_timer_adds_next_wave_and_keeps_positions())


async def _uncleared_wave_timer_adds_next_wave_and_keeps_positions():
    game = Game()
    p = await game.add_player()
    await game.handle_message(p.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.map_objects.clear()
        player = game.players[p.id]
        player.x = 4.25
        player.z = -3.5
        existing = len(game.enemies)
        game.wave["nextWaveAt"] = 0
    await game.tick()
    state = await game.snapshot(p.id)
    assert state["wave"]["number"] == 2
    assert len(state["enemies"]) > existing
    assert state["players"][p.id]["position"] == {"x": 4.25, "z": -3.5}


def test_wave_clear_starts_twenty_second_prep_timer():
    asyncio.run(_wave_clear_starts_twenty_second_prep_timer())


async def _wave_clear_starts_twenty_second_prep_timer():
    game = Game()
    p = await game.add_player()
    await game.handle_message(p.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        for enemy_id in list(game.enemies):
            game._kill_enemy_locked(enemy_id)
    state = await game.snapshot(p.id)
    assert state["wave"]["state"] == "break"
    assert 19 <= state["wave"]["nextWaveIn"] <= 20


def test_wave_clear_heals_survivors_by_fifteen_percent():
    asyncio.run(_wave_clear_heals_survivors_by_fifteen_percent())


async def _wave_clear_heals_survivors_by_fifteen_percent():
    game = Game()
    p = await game.add_player()
    await game.handle_message(p.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        player = game.players[p.id]
        max_health = player.stats["maxHealth"]
        player.hp = max_health * 0.5
        expected = player.hp + max_health * 0.15
        for enemy in game.enemies.values():
            enemy.xp = 0
        for enemy_id in list(game.enemies):
            game._kill_enemy_locked(enemy_id)
        assert math.isclose(player.hp, expected, rel_tol=0.001)
        assert any(event.get("type") == "heal" and event.get("abilityId") == "wave_clear_heal" for event in game.events)


def test_boss_waves_continue_instead_of_victory():
    asyncio.run(_boss_waves_continue_instead_of_victory())


async def _boss_waves_continue_instead_of_victory():
    game = Game()
    p = await game.add_player()
    await game.handle_message(p.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game._start_wave_locked(10)
        assert len(game.enemies) == 1
        boss = next(iter(game.enemies.values()))
        assert boss.boss
        assert game.wave["nextWaveAt"] is None
        game._kill_enemy_locked(boss.id)
        assert game.match_state == "running"
        assert game.wave["state"] == "break"
        game.wave["nextWaveAt"] = 0
    await game.tick()
    state = await game.snapshot(p.id)
    assert state["wave"]["number"] == 11
    assert state["matchState"] == "running"
    assert all(not enemy["boss"] for enemy in state["enemies"].values())


def test_every_tenth_wave_spawns_solo_boss():
    asyncio.run(_every_tenth_wave_spawns_solo_boss())


async def _every_tenth_wave_spawns_solo_boss():
    game = Game()
    p = await game.add_player()
    await game.handle_message(p.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game._start_wave_locked(20)
        assert len(game.enemies) == 1
        assert next(iter(game.enemies.values())).boss


def test_boss_wave_waits_for_previous_wave_clear():
    asyncio.run(_boss_wave_waits_for_previous_wave_clear())


async def _boss_wave_waits_for_previous_wave_clear():
    game = Game()
    p = await game.add_player()
    await game.handle_message(p.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game._start_wave_locked(9)
        game.wave["nextWaveAt"] = 0
        existing = set(game.enemies)
    await game.tick()
    state = await game.snapshot(p.id)
    assert state["wave"]["number"] == 9
    assert set(state["enemies"]) == existing
    assert all(not enemy["boss"] for enemy in state["enemies"].values())


def test_boss_triple_meteor_warns_then_damages_players_in_area():
    asyncio.run(_boss_triple_meteor_warns_then_damages_players_in_area())


async def _boss_triple_meteor_warns_then_damages_players_in_area():
    game = Game()
    p = await game.add_player()
    await game.handle_message(p.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game._start_wave_locked(10)
        player = game.players[p.id]
        boss = next(iter(game.enemies.values()))
        boss.special_attack_at = 0
        game._tick_boss_special_locked(boss, 1)
        meteors = [effect for effect in game.ground_effects if effect.get("type") == "boss_meteor"]
        assert len(meteors) == 3
        meteor = meteors[0]
        player.x = meteor["x"]
        player.z = meteor["z"]
        before = player.hp
        game._tick_ground_effects_locked(meteor["impactAt"])
        assert player.hp < before
        assert any(event.get("type") == "ground_impact" and event.get("abilityId") == "boss_triple_meteor" for event in game.events)


def test_late_wave_scaling_accelerates_and_adds_more_enemies():
    game = Game()
    game.players["dummy"] = Player(id="dummy", name="Dummy")
    game._start_wave_locked(1)
    wave_one_count = len(game.enemies)
    wave_one_enemy = next(iter(game.enemies.values()))
    base_health_ratio = wave_one_enemy.max_health / game.enemies_data[wave_one_enemy.type]["maxHealth"]
    game.enemies.clear()
    game._start_wave_locked(11)
    late_enemy = next(iter(game.enemies.values()))
    late_health_ratio = late_enemy.max_health / game.enemies_data[late_enemy.type]["maxHealth"]
    assert len(game.enemies) > wave_one_count
    assert late_health_ratio > base_health_ratio + 1.5


def test_attack_speed_upgrade_reduces_auto_attack_interval():
    game = Game()
    player = Player(id="player", name="Player")
    player.stats = {"autoAttackInterval": 2.0}
    player.auto_attack_at = time.monotonic() + 2.0
    player.pending_upgrades = [{**next(upgrade for upgrade in game.upgrades if upgrade["id"] == "attack_speed"), "choiceType": "stat"}]
    game._choose_upgrade_locked(player, "attack_speed")
    assert player.stats["autoAttackInterval"] == 1.8
    assert 1.7 <= player.auto_attack_at - time.monotonic() <= 1.8


def test_paladin_lay_on_hands_fully_heals_selected_ally():
    asyncio.run(_paladin_lay_on_hands_fully_heals_selected_ally())


async def _paladin_lay_on_hands_fully_heals_selected_ally():
    game = Game()
    paladin = await game.add_player()
    ally = await game.add_player()
    await game.handle_message(paladin.id, {"type": "select_class", "classId": "paladin"})
    await game.handle_message(ally.id, {"type": "select_class", "classId": "warrior"})
    async with game._lock:
        game._start_match_locked()
        game.map_objects.clear()
        caster = game.players[paladin.id]
        target = game.players[ally.id]
        caster.abilities.append("paladin_lay_on_hands")
        caster.ability_slots["paladin_lay_on_hands"] = 6
        caster.resource = caster.stats["maxResource"]
        caster.ally_target_id = target.id
        target.hp = 1
        game._cast_ability_locked(caster, 6)
        assert target.hp == target.stats["maxHealth"]
        assert caster.cooldowns["paladin_lay_on_hands"] > time.monotonic()
        assert any(event.get("type") == "heal" and event.get("abilityId") == "paladin_lay_on_hands" for event in game.events)


def test_cone_of_cold_only_hits_enemies_in_front_of_mage():
    game = Game()
    mage = Player(id="mage", name="Mage", class_id="mage")
    mage.stats = dict(game.classes["mage"]["baseStats"])
    mage.resource = mage.stats["maxResource"]
    mage.abilities = ["mage_cone_of_cold"]
    mage.ability_slots = {"mage_cone_of_cold": 2}
    mage.facing = 0
    game.players[mage.id] = mage
    front = game.spawn_enemy_locked("goblin", {"x": 0, "z": 5})
    behind = game.spawn_enemy_locked("goblin", {"x": 0, "z": -5})
    front_hp, behind_hp = front.hp, behind.hp
    game._cast_ability_locked(mage, 2)
    assert front.hp < front_hp
    assert front.slow_until > 0
    assert behind.hp == behind_hp


def test_movement_updates_facing_used_by_cone_of_cold():
    game = Game()
    game.map_objects.clear()
    mage = Player(id="mage", name="Mage", class_id="mage")
    mage.stats = dict(game.classes["mage"]["baseStats"])
    mage.resource = mage.stats["maxResource"]
    mage.abilities = ["mage_cone_of_cold"]
    mage.ability_slots = {"mage_cone_of_cold": 2}
    mage.input = {"right": True}
    game.players[mage.id] = mage
    game._tick_players_locked(time.monotonic(), 0.1)
    right = game.spawn_enemy_locked("goblin", {"x": 5, "z": 0})
    left = game.spawn_enemy_locked("goblin", {"x": -5, "z": 0})
    right_hp, left_hp = right.hp, left.hp
    game._cast_ability_locked(mage, 2)
    assert math.isclose(mage.facing, math.pi / 2)
    assert right.hp < right_hp
    assert left.hp == left_hp


def test_blizzard_can_be_placed_and_ticks_aoe_damage():
    game = Game()
    mage = Player(id="mage", name="Mage", class_id="mage")
    mage.stats = dict(game.classes["mage"]["baseStats"])
    mage.resource = mage.stats["maxResource"]
    mage.abilities = ["mage_blizzard"]
    mage.ability_slots = {"mage_blizzard": 7}
    game.players[mage.id] = mage
    inside = game.spawn_enemy_locked("goblin", {"x": 8, "z": 0})
    outside = game.spawn_enemy_locked("goblin", {"x": -8, "z": 0})
    inside_hp, outside_hp = inside.hp, outside.hp
    game._cast_ability_locked(mage, 7, {"x": 8, "z": 0})
    blizzard = next(effect for effect in game.ground_effects if effect["type"] == "blizzard")
    game._tick_ground_effects_locked(blizzard["nextTick"])
    assert inside.hp < inside_hp
    assert inside.slow_until > 0
    assert outside.hp == outside_hp


def test_hunter_arrow_barrage_can_be_placed_and_repeatedly_damages_its_area():
    game = Game()
    hunter = Player(id="hunter", name="Hunter", class_id="hunter")
    hunter.stats = dict(game.classes["hunter"]["baseStats"])
    hunter.resource = hunter.stats["maxResource"]
    hunter.abilities = ["hunter_arrow_barrage"]
    hunter.ability_slots = {"hunter_arrow_barrage": 6}
    game.players[hunter.id] = hunter
    inside = game.spawn_enemy_locked("goblin", {"x": 8, "z": 0})
    outside = game.spawn_enemy_locked("goblin", {"x": -8, "z": 0})
    inside_hp, outside_hp = inside.hp, outside.hp

    game._cast_ability_locked(hunter, 6, {"x": 8, "z": 0})

    barrage = next(effect for effect in game.ground_effects if effect["abilityId"] == "hunter_arrow_barrage")
    game._tick_ground_effects_locked(barrage["nextTick"])
    assert barrage["type"] == "volley"
    assert inside.hp < inside_hp
    assert outside.hp == outside_hp


def test_every_class_has_two_new_signature_spells():
    game = Game()
    expected = {
        "warrior": {"warrior_execute", "warrior_heroic_leap"},
        "hunter": {"hunter_disengage", "hunter_volley"},
        "priest": {"priest_holy_nova", "priest_leap_of_faith"},
        "mage": {"mage_flamestrike", "mage_dragons_breath"},
        "rogue": {"rogue_fan_of_knives", "rogue_shadowstep"},
        "druid": {"druid_starfall", "druid_wild_growth"},
        "shaman": {"shaman_thunderstorm", "shaman_riptide"},
        "paladin": {"paladin_divine_storm", "paladin_avengers_shield"},
    }
    for class_id, ability_ids in expected.items():
        assert ability_ids <= {ability_id for ability_id, ability in game.abilities.items() if ability["classId"] == class_id}


def test_mage_can_learn_every_spell_with_a_unique_action_slot():
    game = Game()
    mage = Player(id="mage", name="Mage", class_id="mage")
    mage.stats = dict(game.classes["mage"]["baseStats"])
    mage.abilities = list(game.classes["mage"]["startingAbilities"])
    mage.ability_slots = {ability_id: game.abilities[ability_id]["slot"] for ability_id in mage.abilities}
    for ability_id, ability in game.abilities.items():
        if ability["classId"] != "mage" or ability_id in mage.abilities:
            continue
        mage.pending_upgrades = game._level_choices_locked(mage)
        game._choose_upgrade_locked(mage, f"learn:{ability_id}")
    assigned_slots = [mage.ability_slots.get(ability_id, game.abilities[ability_id]["slot"]) for ability_id in mage.abilities]
    assert len(mage.abilities) == 11
    assert len(set(assigned_slots)) == 11
    assert max(assigned_slots) == 11


def test_execute_bonus_and_heroic_leap_mechanics():
    game = Game()
    warrior = Player(id="warrior", name="Warrior", class_id="warrior")
    warrior.stats = dict(game.classes["warrior"]["baseStats"])
    warrior.stats["critChance"] = 0
    warrior.resource = warrior.stats["maxResource"]
    warrior.abilities = ["warrior_execute", "warrior_heroic_leap"]
    warrior.ability_slots = {"warrior_execute": 2, "warrior_heroic_leap": 6}
    game.players[warrior.id] = warrior
    healthy = game.spawn_enemy_locked("brute", {"x": 1, "z": 0})
    low = game.spawn_enemy_locked("brute", {"x": -1, "z": 0})
    low.max_health = 500
    low.hp = low.max_health * 0.3
    healthy_before, low_before = healthy.hp, low.hp
    warrior.target_id = healthy.id
    game._cast_ability_locked(warrior, 2)
    normal_damage = healthy_before - healthy.hp
    warrior.global_cooldown_until = 0
    warrior.cooldowns.clear()
    warrior.resource = warrior.stats["maxResource"]
    warrior.target_id = low.id
    game._cast_ability_locked(warrior, 2)
    assert low_before - low.hp > normal_damage * 2
    warrior.global_cooldown_until = 0
    warrior.resource = warrior.stats["maxResource"]
    game._cast_ability_locked(warrior, 6, {"x": 8, "z": 0})
    assert warrior.x == 8
    assert any(event.get("abilityId") == "warrior_heroic_leap" and event.get("type") == "ground_impact" for event in game.events)


def test_sorcerer_unlocks_telegraphed_meteor_from_wave_five():
    asyncio.run(_sorcerer_unlocks_telegraphed_meteor_from_wave_five())


async def _sorcerer_unlocks_telegraphed_meteor_from_wave_five():
    game = Game()
    player = await game.add_player()
    await game.handle_message(player.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game.wave["number"] = 5
        enemy = game.spawn_enemy_locked("sorcerer", {"x": 5, "z": 0})
        enemy.special_attack_at = 0.5
        game._tick_enemy_special_locked(enemy, 1)
        meteor = next(effect for effect in game.ground_effects if effect["type"] == "enemy_meteor")
        target = game.players[player.id]
        target.x, target.z = meteor["x"], meteor["z"]
        before = target.hp
        game._tick_ground_effects_locked(meteor["impactAt"])
        assert target.hp < before


def test_runner_unlocks_telegraphed_charge_from_wave_seven():
    asyncio.run(_runner_unlocks_telegraphed_charge_from_wave_seven())


async def _runner_unlocks_telegraphed_charge_from_wave_seven():
    game = Game()
    player = await game.add_player()
    await game.handle_message(player.id, {"type": "select_class", "classId": "warrior"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game.map_objects.clear()
        game.wave["number"] = 7
        target = game.players[player.id]
        target.x, target.z = 0, 0
        enemy = game.spawn_enemy_locked("runner", {"x": 8, "z": 0})
        enemy.special_attack_at = 0.5
        game._tick_enemy_special_locked(enemy, 1)
        charge = next(effect for effect in game.ground_effects if effect["type"] == "enemy_charge")
        before = target.hp
        game._tick_ground_effects_locked(charge["impactAt"])
        assert target.hp < before
        assert math.hypot(enemy.x - charge["x"], enemy.z - charge["z"]) < 0.01


def test_arcane_missiles_deals_damage_during_channel():
    asyncio.run(_arcane_missiles_deals_damage_during_channel())


async def _arcane_missiles_deals_damage_during_channel():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        game.map_objects.clear()
        player = game.players[mage.id]
        player.pending_upgrades = game._level_choices_locked(player)
        game._choose_upgrade_locked(player, "learn:mage_arcane_missiles")
        enemy = game.spawn_enemy_locked("brute", {"x": 3, "z": 0})
        player.x = 0
        player.z = 0
        player.target_id = enemy.id
        player.resource = 100
        game._cast_ability_locked(player, player.ability_slots["mage_arcane_missiles"])
        assert player.casting
        before = enemy.hp
        player.casting["channelNextTick"] = 0
        game._tick_channel_cast_locked(player, 1)
        assert enemy.hp < before


def test_ice_block_blocks_damage_and_movement():
    asyncio.run(_ice_block_blocks_damage_and_movement())


async def _ice_block_blocks_damage_and_movement():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        player = game.players[mage.id]
        player.pending_upgrades = game._level_choices_locked(player)
        game._choose_upgrade_locked(player, "learn:mage_ice_block")
        player.resource = 100
        game._finish_cast_locked(player, "mage_ice_block", player.id)
        before_hp = player.hp
        assert Game._damage_player_locked(player, 999) == 0
        assert player.hp == before_hp
        player.input = {"right": True}
        before_x = player.x
        game._tick_players_locked(1, 1)
        assert player.x == before_x


def test_reconnect_during_match_resumes_active_player():
    asyncio.run(_reconnect_during_match_resumes_active_player())


async def _reconnect_during_match_resumes_active_player():
    game = Game()
    player = await game.add_player()
    await game.handle_message(player.id, {"type": "select_class", "classId": "mage"})
    await _spend_lobby_upgrades(game, player.id)
    await game.handle_message(player.id, {"type": "ready", "ready": True})
    async with game._lock:
        game._start_match_locked()
    token = player.reconnect_token
    # Disconnect leaves the player object behind for a grace period.
    await game.remove_player(player.id)
    assert player.id in game.players
    assert game.players[player.id].disconnected_at is not None
    # A late joiner without the token still becomes a spectator.
    spectator = await game.add_player()
    assert spectator.spectator is True
    # Reconnecting with the token resumes the original player.
    reconnected = await game.add_player(token)
    assert reconnected.id == player.id
    assert reconnected.spectator is False
    assert reconnected.disconnected_at is None
    # The resumed player can act again.
    snapshot = await game.snapshot(reconnected.id)
    assert snapshot["players"][reconnected.id]["spectator"] is False
    assert snapshot.get("reconnectToken") == token


def test_disconnected_player_is_not_counted_for_defeat():
    asyncio.run(_disconnected_player_is_not_counted_for_defeat())


def test_no_active_players_resets_to_lobby_after_grace_period():
    asyncio.run(_no_active_players_resets_to_lobby_after_grace_period())


def test_reconnect_clears_no_active_players_reset_timer():
    asyncio.run(_reconnect_clears_no_active_players_reset_timer())


def test_running_match_can_be_ended_manually():
    asyncio.run(_running_match_can_be_ended_manually())


async def _disconnected_player_is_not_counted_for_defeat():
    game = Game()
    player = await game.add_player()
    await game.handle_message(player.id, {"type": "select_class", "classId": "mage"})
    await _spend_lobby_upgrades(game, player.id)
    await game.handle_message(player.id, {"type": "ready", "ready": True})
    async with game._lock:
        game._start_match_locked()
    await game.remove_player(player.id)
    # With no active players left the match should not immediately end in defeat.
    async with game._lock:
        game._check_end_states_locked()
    assert game.match_state == "running"


async def _no_active_players_resets_to_lobby_after_grace_period():
    game = Game()
    player = await game.add_player()
    await game.handle_message(player.id, {"type": "select_class", "classId": "mage"})
    await _spend_lobby_upgrades(game, player.id)
    await game.handle_message(player.id, {"type": "ready", "ready": True})
    async with game._lock:
        game._start_match_locked()
    spectator = await game.add_player()
    await game.remove_player(player.id)
    async with game._lock:
        game.no_active_players_since = time.monotonic() - 31
    await game.tick()
    state = await game.snapshot(spectator.id)
    assert state["matchState"] == "lobby"
    assert player.id not in state["players"]
    assert state["players"][spectator.id]["spectator"] is False
    assert state["players"][spectator.id]["classId"] is None
    assert state["enemies"] == {}


async def _reconnect_clears_no_active_players_reset_timer():
    game = Game()
    player = await game.add_player()
    await game.handle_message(player.id, {"type": "select_class", "classId": "mage"})
    await _spend_lobby_upgrades(game, player.id)
    await game.handle_message(player.id, {"type": "ready", "ready": True})
    async with game._lock:
        game._start_match_locked()
    token = player.reconnect_token
    await game.remove_player(player.id)
    async with game._lock:
        game.no_active_players_since = time.monotonic() - 31
    reconnected = await game.add_player(token)
    assert reconnected.id == player.id
    await game.tick()
    assert game.match_state == "running"
    async with game._lock:
        assert game.no_active_players_since is None


async def _running_match_can_be_ended_manually():
    game = Game()
    player = await game.add_player()
    await game.handle_message(player.id, {"type": "select_class", "classId": "mage"})
    await _spend_lobby_upgrades(game, player.id)
    await game.handle_message(player.id, {"type": "ready", "ready": True})
    async with game._lock:
        game._start_match_locked()
    spectator = await game.add_player()
    await game.handle_message(player.id, {"type": "restart_match"})
    state = await game.snapshot(player.id)
    assert state["matchState"] == "lobby"
    assert state["players"][player.id]["classId"] is None
    assert state["players"][spectator.id]["spectator"] is False
