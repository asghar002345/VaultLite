#!/usr/bin/env bash
# Run the v4.1 Maestro flows on ONE USB-connected Android device (preview/dev build installed).
# Usage: PIN=<6-digit test PIN> scripts/run-maestro-usb.sh [flow.yaml ...]   (default: v4.1 flows)
# The PIN is never stored in the flows; it is passed to Maestro as -e PIN=...
# TESTNET ONLY: flows use the public BIP-39 test mnemonic and never sign or broadcast.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -z "${JAVA_HOME:-}" ] && [ -x "$HOME/jdk17/bin/java" ] && export JAVA_HOME="$HOME/jdk17"
[ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"
export PATH="$HOME/.maestro/bin:${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools:$PATH"
command -v adb >/dev/null || { echo "adb not found (install Android platform-tools / set ANDROID_HOME)"; exit 1; }
command -v maestro >/dev/null || { echo "maestro not found (~/.maestro/bin)"; exit 1; }

[[ "${PIN:-}" =~ ^[0-9]{6}$ ]] || { echo "Set PIN=<6-digit test PIN> (e.g. PIN=135790 for the test wallet)."; exit 6; }

adb start-server >/dev/null
mapfile -t DEVICES < <(adb devices | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1}')
UNAUTH=$(adb devices | awk 'NR>1 && $2=="unauthorized" {print $1}')
[ -n "$UNAUTH" ] && echo "Unauthorized device(s): $UNAUTH, accept the USB debugging prompt on the phone."
if [ "${#DEVICES[@]}" -eq 0 ]; then echo "No USB device in 'device' state. Check cable, USB debugging, 'adb devices'."; exit 2; fi
if [ "${#DEVICES[@]}" -gt 1 ] && [ -z "${DEVICE:-}" ]; then echo "Multiple devices: ${DEVICES[*]}. Set DEVICE=<serial>."; exit 3; fi
SERIAL="${DEVICE:-${DEVICES[0]}}"
echo "Device: $SERIAL ($(adb -s "$SERIAL" shell getprop ro.product.model | tr -d '\r'))"

adb -s "$SERIAL" shell pm list packages | grep -q 'com.vaultlite.demo' || { echo "com.vaultlite.demo not installed on $SERIAL. Install the preview APK first."; exit 4; }

FLOWS=("$@")
[ "${#FLOWS[@]}" -eq 0 ] && FLOWS=(.maestro/v41-unlock.yaml .maestro/v41-pull-to-refresh.yaml .maestro/v41-chart-ranges.yaml)
for f in "${FLOWS[@]}"; do maestro check-syntax "$f" >/dev/null || { echo "Syntax error in $f"; exit 5; }; done

mkdir -p maestro-results
maestro --device "$SERIAL" test -e PIN="$PIN" --format junit --output maestro-results/v41-junit.xml "${FLOWS[@]}"
