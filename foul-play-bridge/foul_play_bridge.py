"""
Direct Showdown-protocol -> Foul Play search bridge.

Reads JSONL commands from stdin and emits JSONL events on stdout.
The bridge runs inside the Foul Play checkout so its package/data/dependencies
are importable.
"""

import asyncio
import json
import logging
import sys
import time

from fp.battle.state import Battle
from fp.battle.protocol import async_update_battle
from fp.format_spec import FormatSpec
from fp.modes.standard_battle import StandardBattleMode
from fp.modes.base import async_pick_move
from fp.config import FoulPlayConfig


class Bridge:
    def __init__(self):
        self.battle = None
        self.mode = None
        self.format = None
        self.initialized = False
        self.pending_request = None
        self.pending_opponent_switch = None
        self.searching = False
        self.next_rqid = 1

    def send(self, obj):
        sys.stdout.write(json.dumps(obj, separators=(",", ":")) + "\n")
        sys.stdout.flush()

    @staticmethod
    def normalize_team(team):
        if not isinstance(team, list):
            raise ValueError("Foul Play team must be a list of sets")

        normalized = []
        for index, pokemon in enumerate(team):
            if not isinstance(pokemon, dict):
                raise ValueError(f"Foul Play team slot {index + 1} is not an object")

            species = pokemon.get("species") or pokemon.get("name")
            if not isinstance(species, str) or not species.strip():
                raise ValueError(f"Foul Play team slot {index + 1} has no species")

            evs = pokemon.get("evs") or {}
            normalized.append({
                "species": species.strip().lower(),
                "nature": pokemon.get("nature") or "serious",
                "evs": {
                    "hp": int(evs.get("hp") or 0),
                    "atk": int(evs.get("atk") or 0),
                    "def": int(evs.get("def") or 0),
                    "spa": int(evs.get("spa") or 0),
                    "spd": int(evs.get("spd") or 0),
                    "spe": int(evs.get("spe") or 0),
                },
            })
        return normalized

    def init(self, msg):
        self.format = msg.get("format")
        if not isinstance(self.format, str) or not self.format.startswith("gen"):
            raise ValueError(f"invalid Foul Play format: {self.format!r}")

        spec = FormatSpec.from_format_string(self.format)
        if spec.gen_number == 0:
            raise ValueError(f"format does not contain a supported generation: {self.format!r}")

        FoulPlayConfig.pokemon_format = self.format
        FoulPlayConfig.smogon_stats = msg.get("smogon_stats_format") or spec.base_name
        FoulPlayConfig.search_time_ms = int(msg.get("search_time_ms", 100))
        FoulPlayConfig.parallelism = int(msg.get("search_parallelism", 1))
        FoulPlayConfig.search_threads = int(msg.get("search_threads", 1))

        self.mode = StandardBattleMode()
        self.battle = Battle("bridge")
        self.battle.pokemon_format = self.format
        self.battle.generation = spec.generation
        self.battle.battle_type = spec.battle_type
        self.battle.mode = self.mode
        self.battle.user.name = msg.get("user_side", "p1")
        self.battle.opponent.name = msg.get("opponent_side", "p2")
        self.battle.user.account_name = "FoulPlayOptimizer"
        self.battle.opponent.account_name = "FoulPlayOptimizer"
        self.battle.user.team_dict = self.normalize_team(msg.get("user_team"))
        self.battle.opponent.team_dict = self.normalize_team(msg.get("opponent_team"))
        self.send({"type": "ready", "format": str(spec), "generation": spec.generation})

    async def initialize_from_first_turn(self):
        if self.initialized:
            return
        if self.pending_request is None or self.pending_opponent_switch is None:
            return
        self.battle.start_non_team_preview_battle(
            self.pending_request,
            self.pending_opponent_switch,
        )
        unique = set(
            [p.name for p in self.battle.user.reserve]
            + [self.battle.user.active.name]
        )
        self.mode.smogon_sets.initialize(
            FormatSpec.from_format_string(FoulPlayConfig.smogon_stats or self.format),
            unique,
        )
        self.mode.team_datasets.initialize(self.battle.format_spec, unique)
        self.initialized = True
        from fp.battle.protocol import process_battle_updates
        process_battle_updates(self.battle)

    @staticmethod
    def request_needs_decision(request):
        if not request or request.get("wait"):
            return False
        if request.get("teamPreview"):
            return False
        return bool(request.get("active") or request.get("forceSwitch"))

    def capture_lines(self, lines):
        request_seen = False
        for line in lines:
            if "|request|" in line:
                try:
                    request = json.loads(line.split("|request|", 1)[1])
                    # The local Showdown adapter used by the optimizer does not
                    # always include rqid. Foul Play's protocol code requires the
                    # field, so preserve a real Showdown rqid when present and use
                    # a monotonically increasing adapter-local id otherwise.
                    rqid = request.get("rqid")
                    if rqid is None:
                        rqid = self.next_rqid
                        self.next_rqid += 1
                        request["rqid"] = rqid
                    self.pending_request = request
                    self.battle.request_json = request
                    self.battle.rqid = rqid
                    request_seen = True
                except json.JSONDecodeError:
                    pass

            if line.startswith("|switch|"):
                parts = line.split("|")
                if len(parts) > 3 and parts[2].startswith(self.battle.opponent.name + "a:"):
                    if self.pending_opponent_switch is None:
                        self.pending_opponent_switch = line
        return request_seen

    async def message(self, chunk):
        if not self.battle:
            raise RuntimeError("bridge received Showdown data before init")

        lines = [x for x in chunk.splitlines() if x]
        request_seen = self.capture_lines(lines)

        await self.initialize_from_first_turn()
        if not self.initialized:
            self.battle.msg_list.extend(lines)
            return

        action_required = False
        for line in lines:
            try:
                required = await async_update_battle(self.battle, line)
                action_required = action_required or bool(required)
            except Exception:
                if self.battle.turn and self.battle.started:
                    raise

        if request_seen and self.request_needs_decision(self.pending_request):
            action_required = True

        if action_required and not self.searching and not self.battle.wait:
            await self.recommend()

    async def recommend(self):
        self.searching = True
        try:
            start = time.perf_counter()
            decision = await async_pick_move(self.battle)
            elapsed_ms = int((time.perf_counter() - start) * 1000)
            self.send({
                "type": "recommendation",
                "decision": decision[0],
                "rqid": decision[1],
                "elapsed_ms": elapsed_ms,
            })
        finally:
            self.searching = False


async def main():
    logging.disable(logging.CRITICAL)
    bridge = Bridge()
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            msg = json.loads(raw)
            if msg["type"] == "init":
                bridge.init(msg)
            elif msg["type"] == "showdown":
                await bridge.message(msg["chunk"])
            elif msg["type"] == "ping":
                bridge.send({"type": "pong"})
            else:
                bridge.send({"type": "error", "error": "unknown message type"})
        except Exception as exc:
            bridge.send({"type": "error", "error": f"{type(exc).__name__}: {exc}"})


if __name__ == "__main__":
    asyncio.run(main())
