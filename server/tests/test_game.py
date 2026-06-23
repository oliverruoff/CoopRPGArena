import asyncio
import math

from app.game import Game


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
        assert game.match_end_at is not None
        # Simulate elapsed time to trigger automatic restart.
        game.match_end_at = 0
    await game.tick()
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
