#!/bin/sh
# Dorsal: lets the site hear the computer's sound, for the keyboard's music modes, with one
# PipeWire input named "Dorsal". Per user, no root.
# Run with: curl -fsSL @SITE@/music.sh | sh   (sh -s en|pt picks the language)
# The build fills in the site and the PipeWire config (setupScripts in vite.config.ts).
set -e

CONF_DIR=${XDG_CONFIG_HOME:-$HOME/.config}/pipewire/pipewire.conf.d
CONF_FILE=$CONF_DIR/dorsal-music.conf

TAGLINE_PT='o som do computador no teclado'
TAGLINE_EN="the computer's sound on the keyboard"
@HEADER@

[ "$(id -u)" -ne 0 ] || fail "$(say 'Rode sem sudo: a entrada é do seu usuário.' 'Run it without sudo: the input belongs to your user.') curl -fsSL @SITE@/music.sh | sh"
command -v pipewire >/dev/null 2>&1 || fail "$(say 'PipeWire não encontrado: a entrada precisa dele.' 'PipeWire not found: the input needs it.')"
command -v systemctl >/dev/null 2>&1 || fail "$(say 'systemctl não encontrado: reinicie o PipeWire à mão depois.' 'systemctl not found: restart PipeWire by hand afterwards.')"

[ -f "$CONF_FILE" ] && existed=1 || existed=
mkdir -p "$CONF_DIR"
cat > "$CONF_FILE" <<'CONF'
@CONF@
CONF
if [ -n "$existed" ]; then
  ok "$(say 'Entrada "Dorsal" atualizada' 'Input "Dorsal" updated')"
else
  ok "$(say 'Entrada "Dorsal" criada' 'Input "Dorsal" created')"
fi
printf '    %s%s%s\n' "$DIM" "$CONF_FILE" "$RESET"

# The sound stops for a moment while PipeWire restarts.
systemctl --user restart pipewire.service
systemctl --user restart pipewire-pulse.service 2>/dev/null || true
systemctl --user restart wireplumber.service 2>/dev/null || true
ok "$(say 'PipeWire reiniciado' 'PipeWire restarted')"

printf '\n  %s\n\n' "$(say 'Pronto! O navegador já pode ouvir o som do computador.' "All set! The browser can now hear the computer's sound.")"
# Chromium connects to the sound server once, when it opens, and loses it when PipeWire restarts.
printf '  %s→%s %s%s%s\n' "$CYAN" "$RESET" "$BOLD" "$(say 'Feche o navegador por completo e abra de novo.' 'Close the browser completely and open it again.')" "$RESET"
printf '  %s→%s %s\n' "$CYAN" "$RESET" "$(say 'No Dorsal, escolha um modo de música e "Som do computador".' 'In Dorsal, pick a music mode and "Computer sound".')"
printf '  %s→%s %s\n' "$CYAN" "$RESET" "$(say 'Quando o navegador pedir o microfone, escolha "Dorsal".' 'When the browser asks for the microphone, pick "Dorsal".')"
printf '\n  %s%s rm %s && systemctl --user restart pipewire%s\n\n' "$DIM" "$(say 'Para desfazer:' 'To undo:')" "$CONF_FILE" "$RESET"
