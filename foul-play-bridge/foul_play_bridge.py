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

    def send(self, obj):
        sys.stdout.write(json.dumps(obj, separators=(",", ":")) + "\n")
        sys.stdout.flush()

    def init(self, msg):
        self.format = msg["format"]
        self.mode = StandardBattleMode()
        self.battle = Battle("bridge-gen3")
        self.battle.pokemon_format = self.format
        spec = FormatSpec.from_format_string(self.format)
        self.battle.generation = spec.generation
        self.battle.battle_type = spec.battle_type
        self.battle.mode = self.mode
        self.battle.user.name = msg.get("user_side", "p1")
        self.battle.opponent.name = msg.get("opponent_side", "p2")
        self.battle.user.account_name = "FoulPlayOptimizer"
        self.battle.opponent.account_name = "FoulPlayOptimizer"
        self.battle.user.team_dict = msg.get("user_team")
        self.battle.opponent.team_dict = msg.get("opponent_team")
        self.send({"type": "ready"})

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

    async def message(self, chunk):
        if not self.battle:
            raise RuntimeError("bridge received Showdown data before init")

        lines = [x for x in chunk.splitlines() if x]
        request_seen = False
        for line in lines:
            if "|request|" in line:
                try:
                    self.pending_request = json.loads(line.split("|request|", 1)[1])
                    self.battle.request_json = self.pending_request
                    self.battle.rqid = self.pending_request.get("rqid")
                    request_seen = True
                except json.JSONDecodeError:
                    pass
            if line.startswith("|switch|"):
                parts = line.split("|")
                if len(parts) > 3 and parts[2] == self.battle.opponent.name:
                    self.pending_opponent_switch = line

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

        # Foul Play's protocol updater does not always report the action
        # requirement for a standalone Showdown request message. The request
        # itself is authoritative: if Showdown is asking this side for an
        # active move/switch and the battle is ready, search for a decision.
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
