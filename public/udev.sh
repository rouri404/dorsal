#!/bin/sh
# Dorsal: lets your user open the Attack Shark X85 Pro without root, by creating one udev rule.
# Run with: curl -fsSL https://dorsal.cotoo.dev/udev.sh | sudo sh
set -e
cat > /etc/udev/rules.d/70-attack-shark-x85.rules <<'RULE'
# Attack Shark X85 Pro (cable 3151:5002, 2.4G dongle 3151:5006): access for the logged-in user
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="3151", ATTRS{idProduct}=="5002|5006", TAG+="uaccess"
RULE
udevadm control --reload
udevadm trigger --subsystem-match=hidraw
echo "Done. Unplug and replug the keyboard's USB cable."
