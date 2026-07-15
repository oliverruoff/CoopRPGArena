import math
import time

from app.game import Game, Player


REQUIRED_STATS = {
    "maxHealth", "maxResource", "attackPower", "spellPower", "armor", "resistance",
    "critChance", "critMultiplier", "moveSpeed", "resourceRegen", "resourceCostMultiplier",
    "autoAttackDamage", "autoAttackInterval", "autoAttackRange", "cooldownReduction", "castSpeed",
}


def player_for(game: Game, class_id: str) -> Player:
    player = Player(id=class_id, name=class_id.title(), class_id=class_id)
    player.base_stats = dict(game.classes[class_id]["baseStats"])
    player.stats = dict(player.base_stats)
    player.hp = player.stats["maxHealth"]
    player.resource = player.stats["maxResource"]
    game.players[player.id] = player
    return player


def test_every_class_has_a_complete_and_sane_stat_schema():
    game = Game()
    for class_data in game.classes.values():
        stats = class_data["baseStats"]
        assert REQUIRED_STATS <= stats.keys()
        assert stats["maxHealth"] > 0
        assert stats["maxResource"] > 0
        assert stats["resourceCostMultiplier"] == 1
        assert stats["autoAttackInterval"] > 0
        assert stats["castSpeed"] > 0
        assert 0 <= stats["critChance"] <= 1
        assert stats["critMultiplier"] >= 1


def test_resource_regen_uses_live_regen_and_live_maximum():
    game = Game()
    player = player_for(game, "mage")
    player.stats["maxResource"] = 200
    player.stats["resourceRegen"] = 7
    player.resource = 180

    game._tick_players_locked(time.monotonic(), 2)
    assert player.resource == 194
    game._tick_players_locked(time.monotonic(), 2)
    assert player.resource == 200


def test_resource_cost_multiplier_changes_real_cost_without_changing_capacity():
    game = Game()
    player = player_for(game, "hunter")
    ability = game.abilities["hunter_power_shot"]
    original_max = player.stats["maxResource"]
    base_cost = game._ability_cost_locked(player, ability)

    player.stats["resourceCostMultiplier"] = 0.7
    assert math.isclose(game._ability_cost_locked(player, ability), base_cost * 0.7)
    assert player.stats["maxResource"] == original_max


def test_power_crit_and_enemy_mitigation_compose_in_damage_formula():
    game = Game()
    mage = player_for(game, "mage")
    mage.stats["spellPower"] = 40
    mage.stats["critChance"] = 1
    mage.stats["critMultiplier"] = 2
    enemy = game.spawn_enemy_locked("goblin", {"x": 1, "z": 0})
    enemy.resistance = 100
    enemy.hp = enemy.max_health = 1000

    raw = 20 + mage.stats["spellPower"] * 0.5
    game._damage_enemy_locked(mage, enemy, raw, "arcane", 1)
    expected = Game._mitigate(raw * mage.stats["critMultiplier"], enemy.resistance)
    assert math.isclose(1000 - enemy.hp, expected)


def test_move_speed_cast_speed_cdr_and_auto_speed_change_runtime_timing():
    game = Game()
    mage = player_for(game, "mage")
    game.map_objects.clear()
    mage.input = {"right": True}
    mage.stats["moveSpeed"] = 8
    game._tick_players_locked(time.monotonic(), 0.5)
    assert math.isclose(mage.x, 4)

    mage.abilities = ["mage_fireball", "mage_frost_nova"]
    mage.ability_slots = {"mage_fireball": 1, "mage_frost_nova": 2}
    enemy = game.spawn_enemy_locked("goblin", {"x": 6, "z": 0})
    mage.target_id = enemy.id
    mage.input = {}
    mage.stats["castSpeed"] = 2
    game._cast_ability_locked(mage, 1)
    assert mage.casting is not None
    assert math.isclose(mage.casting["duration"], game.abilities["mage_fireball"]["castTime"] / 2)

    mage.casting = None
    mage.global_cooldown_until = 0
    mage.stats["cooldownReduction"] = 0.25
    mage.stats["autoAttackInterval"] = 1.2
    started = time.monotonic()
    game._cast_ability_locked(mage, 2)
    expected_cd = game.abilities["mage_frost_nova"]["cooldown"] * 0.75
    assert math.isclose(mage.cooldowns["mage_frost_nova"] - started, expected_cd, abs_tol=0.02)
    assert game._auto_attack_dict(mage, time.monotonic())["interval"] == 1.2
