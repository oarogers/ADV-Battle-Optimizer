#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -d foul-play-src ]; then
  git clone https://github.com/pmariglia/foul-play.git foul-play-src
fi

cd foul-play-src
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

mkdir -p bridge
cp "$ROOT/foul-play-bridge/foul_play_bridge.py" bridge/foul_play_bridge.py

echo
echo "Foul Play setup complete."
echo "Bridge installed at foul-play-src/bridge/foul_play_bridge.py"
