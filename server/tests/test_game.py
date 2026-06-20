import asyncio
import math

from app.game import Game


def test_mitigation_reduces_damage():
    assert round(Game._mitigate(100, 100), 2) == 50


def test_lobby_start_and_spawn_enemy():
    asyncio.run(_lobby_start_and_spawn_enemy())


async def _lobby_start_and_spawn_enemy():
    game = Game()
    p = await game.add_player()
    await game.handle_message(p.id, {"type": "select_class", "classId": "mage"})
    await game.handle_message(p.id, {"type": "ready", "ready": True})
    async with game._lock:
        game._start_match_locked()
    state = await game.snapshot(p.id)
    assert state["matchState"] == "running"
    assert state["players"][p.id]["classId"] == "mage"
    assert state["enemies"]


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
        game._finish_cast_locked(pr, casting["abilityId"], casting["targetId"])
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
    assert state["enemies"][enemy.id]["hp"] == state["enemies"][enemy.id]["maxHealth"]


def test_same_spell_recast_does_not_restart_cast():
    asyncio.run(_same_spell_recast_does_not_restart_cast())


async def _same_spell_recast_does_not_restart_cast():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
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
