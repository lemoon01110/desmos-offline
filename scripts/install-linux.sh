#!/usr/bin/env sh
# Adds "Desmos Offline" to the Linux app menu and a `desmos-offline` command in ~/.local/bin.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications"
ln -sf "$DIR/bin/desmos-offline" "$HOME/.local/bin/desmos-offline"
cat > "$HOME/.local/share/applications/desmos-offline.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Desmos Offline
GenericName=Graphing Calculator
Comment=Desmos calculators that work offline (unofficial)
Exec=$HOME/.local/bin/desmos-offline
Icon=$DIR/app/icon.png
Categories=Education;Math;Science;
Keywords=desmos;graph;calculator;math;geometry;3d;
StartupWMClass=Desmos Offline
DESK
echo "Installed. Look for \"Desmos Offline\" in your app menu."
