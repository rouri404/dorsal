#!/bin/sh
# Dorsal: lets your user open the Attack Shark X85 Pro without root, with one udev rule.
# Run with: curl -fsSL @SITE@/udev.sh | sudo sh   (sh -s en|pt picks the language)
# The build fills in the site and the rule (udevScript in vite.config.ts).
set -e

RULE_FILE=/etc/udev/rules.d/70-attack-shark-x85.rules

TAGLINE_PT='acesso ao Attack Shark X85 Pro'
TAGLINE_EN='access to the Attack Shark X85 Pro'
@HEADER@

[ "$(id -u)" -eq 0 ] || fail "$(say 'Precisa de root. Rode:' 'This needs root. Run:') curl -fsSL @SITE@/udev.sh | sudo sh"
command -v udevadm >/dev/null 2>&1 || fail "$(say 'udevadm não encontrado: este sistema não usa udev.' 'udevadm not found: this system does not use udev.')"

[ -f "$RULE_FILE" ] && existed=1 || existed=
mkdir -p "$(dirname "$RULE_FILE")"
cat > "$RULE_FILE" <<'RULE'
@RULE@
RULE
chmod 644 "$RULE_FILE"
if [ -n "$existed" ]; then
  ok "$(say 'Regra de acesso atualizada' 'Access rule updated')"
else
  ok "$(say 'Regra de acesso criada' 'Access rule created')"
fi
printf '    %s%s%s\n' "$DIM" "$RULE_FILE" "$RESET"

udevadm control --reload
udevadm trigger --subsystem-match=hidraw
ok "$(say 'udev recarregado' 'udev reloaded')"

printf '\n  %s\n\n' "$(say 'Pronto! Seu usuário já abre o teclado sem root e sem driver.' 'All set! Your user can now open the keyboard, with no root and no driver.')"
printf '  %s→%s %s%s%s\n' "$CYAN" "$RESET" "$BOLD" "$(say 'Desconecte e reconecte o cabo USB do teclado.' "Unplug and replug the keyboard's USB cable.")" "$RESET"
printf '  %s→%s %s\n' "$CYAN" "$RESET" "$(say 'Depois, abra o Dorsal: @SITE@/app ou o AppImage.' 'Then open Dorsal: @SITE@/en/app or the AppImage.')"
printf '\n  %s%s sudo rm %s%s\n\n' "$DIM" "$(say 'Para desfazer:' 'To undo:')" "$RULE_FILE" "$RESET"
