// The music modes' card: brightness, where the sound comes from, and the bars it makes.

import { useEffect, useRef, useState } from "react";
import { useTr } from "../i18n";
import { BANDS, MAX_HEIGHT } from "../music/bands";
import { liveBars } from "../music/live";
import { SITE } from "../brand";
import { audioInputs, inDesktopApp, startMusic, stopMusic, useMusic, type MusicSource } from "../music/engine";
import { Card, CopyCommand, Stepper } from "./controls";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/motion/select";

/** Sets up, once, the input that lets the site hear the computer's sound (setup/music.sh). */
const MUSIC_SETUP = `curl -fsSL ${SITE}/music.sh | sh`;

export function MusicCard(props: { brightness: number; setBrightness: (b: number) => void; onKeyboard: boolean }) {
  const tr = useTr();
  const music = useMusic();
  const desktop = inDesktopApp();
  // The AppImage hears the computer itself; the site, through music.sh's input or a shared tab.
  const tabs = !desktop && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  // One list for every source: "system", "tab", or "input:<device>" ("input:" for the default).
  const [choice, setChoice] = useState("system");
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const source = (choice.startsWith("input:") ? "input" : choice) as MusicSource;
  const hearing = music.status === "on" || music.status === "starting";
  // Without a tray, closing the AppImage's window quits it, and the music with it.
  const [noTray, setNoTray] = useState(false);
  useEffect(() => void window.dorsal?.tray?.().then((t) => setNoTray(!t)), []);
  // Names show once access to an input was granted, so the list is read again as the sound starts.
  useEffect(() => void audioInputs().then(setInputs), [music.status]);
  const problem =
    music.status !== "error"
      ? null
      : {
          denied: tr("O acesso ao som foi negado.", "Access to the sound was denied."),
          "no-tab-audio": tr("Marque “Compartilhar áudio da aba” ao escolher a aba.", "Tick “Share tab audio” when you pick the tab."),
          "no-system-source": desktop
            ? tr("Não deu para ouvir o som do computador. Ele precisa do PipeWire ou do PulseAudio.", "Could not hear the computer's sound. It needs PipeWire or PulseAudio.")
            : tr("O navegador não ouve o som do computador sozinho. Rode isto uma vez no terminal e tente de novo:", "The browser cannot hear the computer's sound on its own. Run this once in a terminal and try again:"),
          "no-input": desktop
            ? tr("Nenhuma entrada de áudio encontrada.", "No audio input found.")
            : tr("O navegador não encontrou nenhuma entrada de áudio. Se o PipeWire reiniciou com ele aberto, feche o navegador por completo e abra de novo.", "The browser found no audio input. If PipeWire restarted while it was open, close the browser completely and open it again."),
          failed: `${tr("Não deu certo", "It did not work")}: ${music.detail ?? ""}`,
        }[music.error ?? "failed"];

  return (
    <Card title={tr("Som", "Sound")}>
      <Stepper label={tr("Brilho", "Brightness")} value={props.brightness} display={tr(`${props.brightness} de 4`, `${props.brightness} of 4`)} min={0} max={4} onChange={props.setBrightness} />
      <Select
        value={choice}
        onValueChange={(v) => {
          // Another source means hearing again from it.
          if (hearing) void stopMusic();
          setChoice(v);
        }}
      >
        <SelectTrigger aria-label={tr("De onde vem o som", "Where the sound comes from")} className="h-9 w-full border-white/[0.07] bg-[#1a1b1d]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72 overflow-y-auto">
          <SelectItem value="system">{tr("Som do computador", "Computer sound")}</SelectItem>
          {tabs && <SelectItem value="tab">{tr("Som de uma aba", "Sound of a tab")}</SelectItem>}
          <SelectItem value="input:">{tr("Microfone padrão", "Default microphone")}</SelectItem>
          {inputs
            // "Dorsal" is the computer's sound, already first in the list.
            .filter((d) => d.deviceId !== "default" && !d.label.includes("Dorsal"))
            .map((d, i) => (
              <SelectItem key={d.deviceId} value={`input:${d.deviceId}`}>
                {d.label || tr(`Entrada ${i + 1}`, `Input ${i + 1}`)}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      {source === "system" && !desktop && music.status !== "on" && (
        <p className="text-xs text-neutral-500">{tr("Quando o navegador pedir o microfone, escolha “Dorsal”: é o som do computador.", "When the browser asks for the microphone, pick “Dorsal”: it is the computer's sound.")}</p>
      )}
      {source === "tab" && music.status !== "on" && (
        <p className="text-xs text-neutral-500">{tr("Escolha a aba que toca a música e marque “Compartilhar áudio da aba”.", "Pick the tab playing the music and tick “Share tab audio”.")}</p>
      )}
      <Bars on={music.status === "on"} />
      <div className="mt-auto flex flex-col gap-2">
        {problem && <p className="text-xs text-amber-400/90">{problem}</p>}
        {music.status === "error" && music.error === "no-system-source" && !desktop && <CopyCommand command={MUSIC_SETUP} />}
        {music.status === "on" && noTray && (
          <p className="text-xs text-neutral-500">{tr("Fechar a janela encerra a música: sem a extensão AppIndicator, o GNOME não mostra a bandeja.", "Closing the window ends the music: without the AppIndicator extension, GNOME shows no tray.")}</p>
        )}
        {music.status === "on" && !props.onKeyboard && <p className="text-xs text-neutral-500">{tr("Aplique no teclado para as teclas seguirem o som.", "Apply to the keyboard for the keys to follow the sound.")}</p>}
        <button
          type="button"
          disabled={music.status === "starting"}
          onClick={() => (hearing ? void stopMusic() : void startMusic(source, choice.slice("input:".length) || undefined))}
          className={cn("h-9 rounded-lg px-4 text-sm font-medium", hearing ? "bg-white/[0.06] text-neutral-100 hover:bg-white/[0.1]" : "bg-neutral-100 text-neutral-950 hover:bg-white")}
        >
          {music.status === "starting" ? tr("Abrindo o som…", "Opening the sound…") : hearing ? tr("Parar", "Stop") : tr("Ouvir o som", "Listen")}
        </button>
      </div>
    </Card>
  );
}

/** The 42 bars as the keyboard gets them, drawn each frame while the sound is heard. */
function Bars({ on }: { on: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    let frame = 0;
    const draw = () => {
      const { width, height } = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(width * dpr)) c.width = Math.round(width * dpr);
      if (c.height !== Math.round(height * dpr)) c.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const bars = on ? liveBars() : null;
      const w = width / BANDS;
      for (let i = 0; i < BANDS; i++) {
        const h = bars?.[i] ?? 0;
        ctx.fillStyle = h ? getComputedStyle(c).color : "rgba(255,255,255,0.06)";
        const bh = Math.max(2, (h / MAX_HEIGHT) * height);
        ctx.fillRect(i * w + 1, height - bh, Math.max(1, w - 2), bh);
      }
      if (on) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [on]);
  return <canvas ref={canvas} className="h-12 w-full text-data" aria-hidden />;
}
