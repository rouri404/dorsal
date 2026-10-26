# Shared by Dorsal's setup scripts: the language, colours, ok and fail, and the logo.
# An argument wins (sudo rejects most variables); sudo may drop the locale, so the system's is the fallback.
lang=${1:-${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}}
[ -n "$lang" ] || [ ! -r /etc/locale.conf ] || lang=$(. /etc/locale.conf && printf '%s' "${LANG:-}")
case "$lang" in
  pt*) PT=1 ;;
  *) PT= ;;
esac
say() { if [ -n "$PT" ]; then printf '%s' "$1"; else printf '%s' "$2"; fi; }

if [ -t 1 ]; then
  BOLD=$(printf '\033[1m') DIM=$(printf '\033[2m') GREEN=$(printf '\033[32m') CYAN=$(printf '\033[36m') RED=$(printf '\033[31m') RESET=$(printf '\033[0m')
else
  BOLD='' DIM='' GREEN='' CYAN='' RED='' RESET=''
fi
ok() { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
fail() {
  printf '  %s✗%s %s\n\n' "$RED" "$RESET" "$1" >&2
  exit 1
}

TAGLINE=$(say "$TAGLINE_PT" "$TAGLINE_EN")

# The logo, two pixels per character cell: # is the keycap, . the fin, a space is empty.
logo() {
  awk -v title="${BOLD}Dorsal${RESET}" -v tagline="$TAGLINE" -v site="${DIM}$(printf '%s' '@SITE@' | sed 's|^[a-z]*://||')${RESET}" '
    function paint(c) { return c == "#" ? "255" : "232" }
    { rows[NR] = $0 }
    END {
      printf "\n"
      for (r = 1; r < NR; r += 2) {
        line = "  "
        for (i = 1; i <= length(rows[r]); i++) {
          t = substr(rows[r], i, 1); b = substr(rows[r + 1], i, 1)
          if (t == "") t = " "
          if (b == "") b = " "
          if (t == " " && b == " ") line = line "\033[0m "
          else if (b == " ") line = line "\033[0;38;5;" paint(t) "m\342\226\200"
          else if (t == " ") line = line "\033[0;38;5;" paint(b) "m\342\226\204"
          else line = line "\033[38;5;" paint(t) ";48;5;" paint(b) "m\342\226\200"
        }
        line = line "\033[0m   "
        n = (r + 1) / 2
        if (n == 3) line = line title
        if (n == 4) line = line tagline
        if (n == 5) line = line site
        print line
      }
      printf "\n"
    }' <<'LOGO'
 ############ 
##############
##############
#######...####
######...#####
#####....#####
####.....#####
####......####
###.......####
###........###
###........###
##..........##
##############
 ############ 
LOGO
}

if [ -t 1 ]; then
  logo
else
  printf '\n  Dorsal · %s\n\n' "$TAGLINE"
fi
