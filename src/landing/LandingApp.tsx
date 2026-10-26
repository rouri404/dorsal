// Landing page: what the configurator does, shown with the app's own 3D board running in
// demo mode, how to use it in the browser and how to install it on Linux.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArchiveRestore, BadgeInfo, Check, ChevronDown, Copy, Download, Globe, Languages, Laptop, MessageCircleQuestion, PackageOpen, ShieldCheck, Terminal as TerminalIcon, Usb } from "lucide-react";
import { Board3D, type Framing } from "../app/Board3D";
import { FACTORY_BASE } from "../layout/x85-factory";
import { drawClockFace } from "../screen/clockFace";
import { SCREEN_H, SCREEN_W } from "../screen/send";
import type { LightSetting } from "../protocol/x85";
import { useLang, useTr, type Lang } from "../i18n";
import { keyShortName } from "../i18n/labels";
import { navigate, pathOf } from "../router";
import { GitHubMark, Logo, PRODUCT, REPO, SITE } from "../brand";
import { metaFor } from "../seo/meta";
import { cn } from "@/lib/utils";
import { Button, ButtonLink } from "@/components/motion/button/base";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/motion/card";
import { BouncyAccordion } from "@/components/motion/bouncy-accordion";
import { ActionSwapBlurButton } from "@/components/motion/action-swap-blur";
import { TextReveal } from "@/components/motion/text-reveal";
import { SharedLayoutBg } from "@/components/motion/shared-layout-bg";
import { ScrollReveal } from "@/components/motion/scroll-reveal";

const VERSION = "0.1.0";
// The site's root by default, or a release page set in VITE_DOWNLOAD_BASE.
const DOWNLOAD_BASE = (import.meta.env.VITE_DOWNLOAD_BASE ?? "").replace(/\/$/, "");
const APPIMAGE_FILE = `Dorsal-${VERSION}.AppImage`;
const MINI_FILE = `Dorsal-Screen-${VERSION}.AppImage`;
const APPIMAGE = `${DOWNLOAD_BASE}/${APPIMAGE_FILE}`;
const MINI_APPIMAGE = `${DOWNLOAD_BASE}/${MINI_FILE}`;

const VIEWS: { id: Framing; pt: string; en: string; capPt: string; capEn: string }[] = [
  { id: "screen", pt: "Tela", en: "Screen", capPt: "A TFT mostra o relógio de fábrica ou a sua imagem.", capEn: "The TFT shows the factory clock or your image." },
  { id: "keys", pt: "Teclas", en: "Keys", capPt: "Clique numa tecla para trocar o que ela faz.", capEn: "Click a key to change what it does." },
  { id: "light", pt: "Iluminação", en: "Lighting", capPt: "Os efeitos animam no 3D antes de ir para o teclado.", capEn: "Effects play in 3D before they reach the keyboard." },
  { id: "system", pt: "Sistema", en: "System", capPt: "Polling, debounce, bateria e reset de fábrica.", capEn: "Polling, debounce, battery and factory reset." },
];
const DEMO_LIGHT: LightSetting = { mode: 4, speed: 2, brightness: 3, option: 0, rainbow: true, rgb: { r: 250, g: 255, b: 250 } };

const appPath = (lang: Lang) => pathOf({ lang, page: "app", section: "screen" });
const go = (path: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  navigate(path, { fade: true });
};

export function LandingApp() {
  const tr = useTr();
  const lang = useLang();
  useEffect(() => {
    document.title = metaFor("landing", lang).title;
  });
  return (
    <div className="min-h-screen bg-[#0a0b0c] text-neutral-100">
      <Header />
      <main>
        <Hero />
        <Features />
        <Mini />
        <Install />
        <Questions />
      </main>
      <footer className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] px-5 py-8 text-sm text-neutral-500">
        <span className="flex items-center gap-2">
          <Logo className="size-5" /> {PRODUCT}
        </span>
        <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span>{tr("Projeto independente, sem relação com a Attack Shark.", "Independent project, not affiliated with Attack Shark.")}</span>
          <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer" className="text-neutral-400 transition-colors hover:text-white">
            {tr("Software livre, GPL-3.0", "Free software, GPL-3.0")}
          </a>
          <a href={`${REPO}#readme`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-neutral-400 transition-colors hover:text-white">
            <GitHubMark className="size-4" />
          </a>
        </span>
      </footer>
    </div>
  );
}

const NAV = [
  { id: "features", pt: "Recursos", en: "Features" },
  { id: "install", pt: "Instalar", en: "Install" },
  { id: "questions", pt: "Perguntas", en: "Questions" },
];

/** Which of the nav's sections is in view (the one crossing the upper third of the window). */
function useActiveSection() {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-30% 0px -65% 0px" },
    );
    NAV.forEach((n) => {
      const el = document.getElementById(n.id);
      if (el) observer.observe(el);
    });
    const top = () => window.scrollY < 200 && setActive(null);
    window.addEventListener("scroll", top, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", top);
    };
  }, []);
  return active;
}

function Header() {
  const lang = useLang();
  const tr = useTr();
  const active = useActiveSection();
  const home = pathOf({ lang, page: "landing", section: "screen" });
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.05] bg-[#0a0b0c]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-6 px-5">
        <a href={home} onClick={go(home)} className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.01em]">
          <Logo className="size-7" /> {PRODUCT}
        </a>
        <nav className="hidden text-sm md:block" aria-label={tr("Seções", "Sections")}>
          <SharedLayoutBg className="w-auto flex-row items-center gap-1" inset={0} pillClassName="rounded-lg bg-white/[0.07]">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} aria-current={active === n.id ? "true" : undefined} className={cn("block rounded-lg px-3 py-1.5 transition-colors", active === n.id ? "text-white" : "text-neutral-400 hover:text-white")}>
                {tr(n.pt, n.en)}
              </a>
            ))}
          </SharedLayoutBg>
        </nav>
        <div className="flex items-center gap-3">
          <a href={`${REPO}#readme`} target="_blank" rel="noreferrer" aria-label={tr("Código no GitHub", "Source on GitHub")} title="GitHub" className="grid size-8 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white">
            <GitHubMark className="size-[18px]" />
          </a>
          <span className="flex items-center rounded-lg bg-white/[0.05] p-0.5" role="group" aria-label="Idioma / Language">
            {(["pt", "en"] as Lang[]).map((l) => {
              const to = pathOf({ lang: l, page: "landing", section: "screen" });
              return (
                <a
                  key={l}
                  href={to}
                  onClick={(e) => {
                    e.preventDefault();
                    if (lang !== l) navigate(to, { replace: true, fade: true, keepScroll: true });
                  }}
                  aria-current={lang === l ? "true" : undefined}
                  className={cn("grid h-7 place-items-center rounded-md px-2 text-xs uppercase", lang === l ? "bg-white/[0.12] text-white" : "text-neutral-400 hover:text-white")}
                >
                  {l}
                </a>
              );
            })}
          </span>
          <ButtonLink href={appPath(lang)} onClick={go(appPath(lang))} variant="primary" size="sm">
            {tr("Abrir o app", "Open the app")}
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}

/** The app's own board, in demo mode: the visitor can switch views; it advances on its own until they do. */
function Hero() {
  const lang = useLang();
  const tr = useTr();
  const [view, setView] = useState<Framing>("keys");
  const [touched, setTouched] = useState(false);
  const [screen] = useState(() => Object.assign(document.createElement("canvas"), { width: SCREEN_W, height: SCREEN_H }));
  useEffect(() => {
    const ctx = screen.getContext("2d")!;
    const tick = () => drawClockFace(ctx, SCREEN_W, SCREEN_H, lang);
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [screen, lang]);
  useEffect(() => {
    if (touched) return;
    const timer = setInterval(() => setView((v) => VIEWS[(VIEWS.findIndex((x) => x.id === v) + 1) % VIEWS.length].id), 6000);
    return () => clearInterval(timer);
  }, [touched]);
  const current = VIEWS.find((v) => v.id === view)!;

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-[1180px] px-5 pt-12 text-center sm:pt-14">
        <TextReveal
          as="h1"
          text={tr("O seu X85 Pro, configurado no Linux.", "Your X85 Pro, configured on Linux.")}
          className="mx-auto block max-w-[16ch] text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[60px]"
          stagger={0.06}
        />
        <p className="mx-auto mt-5 max-w-[56ch] text-lg text-neutral-400">
          {tr(
            "Imagem da tela, teclas, iluminação e bateria do Attack Shark X85 Pro, sem Windows e sem driver. Direto no navegador, ou num AppImage.",
            "Screen image, keys, lighting and battery of the Attack Shark X85 Pro, with no Windows and no driver. Right in the browser, or as an AppImage.",
          )}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href={appPath(lang)} onClick={go(appPath(lang))} variant="primary" size="lg">
            <Globe className="size-4" /> {tr("Usar no navegador", "Use it in the browser")}
          </ButtonLink>
          <DownloadMenu />
        </div>
      </div>

      <div className="relative h-[min(58vh,620px)] min-h-[320px] [mask-composite:intersect] [mask-image:linear-gradient(to_bottom,transparent,#000_8%,#000_74%,transparent),linear-gradient(to_right,transparent,#000_10%,#000_90%,transparent)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_55%_at_50%_50%,#1a1c20,transparent_70%)]" aria-hidden />
        <Board3D
          className="absolute inset-0"
          screen={screen}
          framing={view}
          face={(pos) => ({ label: keyShortName(lang, FACTORY_BASE[pos] ?? [0, 0, 0, 0]) })}
          faceKey={`factory:${lang}`}
          legends={view === "keys"}
          light={view === "light" ? DEMO_LIGHT : undefined}
          fallback={<img src={shot(lang, "keys.png")} alt={tr("O configurador mostrando o teclado de cima", "The configurator showing the keyboard from above")} className="mx-auto h-full object-contain" />}
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_26%_40%_at_50%_50%,transparent_35%,#0a0b0c_100%)] transition-opacity duration-1000",
            view === "screen" ? "opacity-100" : "opacity-0",
          )}
          aria-hidden
        />
      </div>

      <div className="mx-auto flex max-w-[1180px] flex-col items-center gap-3 px-5 pb-16">
        <Tabs
          value={view}
          onValueChange={(v) => {
            setTouched(true);
            setView(v as Framing);
          }}
          variant="segment"
        >
          <TabsList className="bg-white/[0.05]" aria-label={tr("Vistas do teclado", "Keyboard views")}>
            {VIEWS.map((v) => (
              <TabsTrigger key={v.id} value={v.id}>
                {tr(v.pt, v.en)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <p className="text-center text-sm text-neutral-500">{tr(current.capPt, current.capEn)}</p>
      </div>
    </section>
  );
}

const shot = (lang: Lang, file: string) => `/landing/${lang}/${file}`;

const FEATURES = [
  {
    id: "tela",
    title: ["A sua imagem na tela do teclado.", "Your image on the keyboard's screen."],
    text: ["Escolha uma foto ou um GIF, arraste para enquadrar e envie. O X85 guarda e mostra no lugar do relógio.", "Pick a photo or a GIF, drag to frame it and send. The X85 keeps it and shows it in place of the clock."],
    points: [
      ["GIFs de até 60 quadros, em 128 × 128", "GIFs up to 60 frames, at 128 × 128"],
      ["Arraste para posicionar, role para dar zoom", "Drag to position, scroll to zoom"],
      ["Acerta o relógio do teclado com um clique", "Sets the keyboard's clock in one click"],
      ["O envio continua com a janela em segundo plano", "Uploads keep going with the window in the background"],
    ],
    image: "screen.png",
    alt: ["A seção Tela: a TFT em 3D com uma imagem de pôr do sol e os controles de envio", "The Screen section: the TFT in 3D with a sunset image and the upload controls"],
  },
  {
    id: "teclas",
    title: ["Cada tecla faz o que você quiser.", "Every key does what you want."],
    text: ["Clique na tecla do teclado em 3D e busque o que ela deve fazer: outra tecla, um atalho, mídia, Bluetooth, luz.", "Click the key on the 3D keyboard and search for what it should do: another key, a shortcut, media, Bluetooth, light."],
    points: [
      ["Camada normal e segurando Fn", "Normal layer and holding Fn"],
      ["Knob: apertar e girar para os dois lados", "Knob: press and turn both ways"],
      ["As teclas trocadas aparecem em âmbar", "Changed keys show in amber"],
      ["Volta ao padrão de fábrica a qualquer momento", "Back to factory defaults at any time"],
    ],
    image: "keys.png",
    alt: ["A seção Teclas: o teclado visto de cima com as legendas", "The Keys section: the keyboard from above with its legends"],
  },
  {
    id: "luz",
    title: ["Veja o efeito antes de aplicar.", "See the effect before you apply it."],
    text: ["Os 21 efeitos das teclas animam no modelo 3D, e o estúdio cria os seus, em camadas. O teclado só muda quando você aplicar.", "The 21 key effects play on the 3D model, and the studio makes your own, in layers. The keyboard only changes when you apply."],
    points: [
      ["Arco-íris, cores prontas ou qualquer cor", "Rainbow, ready colours or any colour"],
      ["Brilho e velocidade", "Brightness and speed"],
      ["Estúdio de efeitos, gravado no teclado", "An effect studio, stored on the keyboard"],
      ["Um só botão aplica tudo", "One button applies it all"],
    ],
    image: "light.png",
    alt: ["A seção Iluminação: o teclado com a faixa lateral acesa e a grade de efeitos", "The Lighting section: the keyboard with its side band lit and the grid of effects"],
  },
  {
    id: "sistema",
    title: ["O resto também.", "The rest, too."],
    text: [
      "Taxa de polling, debounce, quanto tempo até as luzes apagarem e até o rádio desligar, backup, e o reset de fábrica, que pede para segurar o botão.",
      "Polling rate, debounce, how long until the lights go off and the radio sleeps, backup, and a factory reset that asks you to hold the button.",
    ],
    points: [
      ["Polling de 125 a 8000 Hz", "Polling from 125 to 8000 Hz"],
      ["Debounce de 0 a 10 ms", "Debounce from 0 to 10 ms"],
      ["Repouso e sono profundo no 2.4G e no Bluetooth", "Sleep and deep sleep on 2.4G and Bluetooth"],
      ["Backup de tudo num arquivo", "Back everything up to a file"],
    ],
    image: "system.png",
    alt: ["A seção Sistema: o teclado de lado e os cartões de resposta, bateria e reset", "The System section: the keyboard from the side and the response, battery and reset cards"],
  },
] as const;

function DownloadMenu() {
  const tr = useTr();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const choices = [
    { href: APPIMAGE, file: APPIMAGE_FILE, title: PRODUCT, text: tr("O app completo: tela, teclas, iluminação e sistema.", "The full app: screen, keys, lighting and system.") },
    { href: MINI_APPIMAGE, file: MINI_FILE, title: "Dorsal Screen", text: tr("Só a tela do teclado, numa janela pequena.", "Just the keyboard's screen, in a small window.") },
  ];
  return (
    <div ref={root} className="relative z-20">
      <Button variant="outline" size="lg" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Download className="size-4" /> {tr("Baixar o AppImage", "Download the AppImage")}
        <ChevronDown className={cn("size-4 transition-transform duration-300", open && "rotate-180")} />
      </Button>
      <div
        role="menu"
        inert={!open}
        className={cn(
          "absolute left-1/2 top-full mt-2 flex w-[300px] -translate-x-1/2 origin-top flex-col rounded-2xl border border-white/[0.08] bg-[#121315] p-1.5 text-left shadow-xl shadow-black/50",
          "transition-[opacity,translate,scale,filter] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-opacity",
          open ? "opacity-100" : "pointer-events-none -translate-y-1.5 scale-[0.97] opacity-0 blur-[2px]",
        )}
      >
        {choices.map((c) => (
          <a
            key={c.file}
            role="menuitem"
            href={c.href}
            download={c.file}
            onClick={() => setOpen(false)}
            className="group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-none"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium text-neutral-100">{c.title}</span>
              <span className="text-sm text-neutral-400">{c.text}</span>
              <span className="num mt-1 truncate text-xs text-neutral-500">{c.file}</span>
            </span>
            <Download className="mt-1 size-4 shrink-0 text-neutral-500 transition-colors group-hover:text-neutral-100" />
          </a>
        ))}
      </div>
    </div>
  );
}

function Features() {
  const lang = useLang();
  const i = lang === "en" ? 1 : 0;
  return (
    <section id="features" className="border-t border-white/[0.05]">
      {FEATURES.map((f, n) => (
        <article key={f.id} className="mx-auto grid max-w-[1180px] items-center gap-10 px-5 py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <ScrollReveal className={cn("flex flex-col gap-5", n % 2 === 1 && "lg:order-2")}>
            <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[40px]">{f.title[i]}</h2>
            <p className="text-lg text-neutral-400">{f.text[i]}</p>
            <ul className="flex flex-col gap-2.5 text-[15px] text-neutral-300">
              {f.points.map((p) => (
                <li key={p[0]} className="flex gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-[#5fd0e6]" /> {p[i]}
                </li>
              ))}
            </ul>
          </ScrollReveal>
          <ScrollReveal delay={0.12} y={24}>
            <figure className="m-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0f1011]">
              <img src={shot(lang, f.image)} alt={f.alt[i]} loading="lazy" className="block w-full" />
            </figure>
          </ScrollReveal>
        </article>
      ))}
    </section>
  );
}

function Mini() {
  const lang = useLang();
  const tr = useTr();
  return (
    <section className="border-t border-white/[0.05] bg-[#0d0e0f]">
      <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-5 py-20 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <ScrollReveal className="flex flex-col gap-5">
          <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[40px]">{tr("Só quer trocar a imagem? Tem um app só para isso.", "Only want to change the image? There is an app just for that.")}</h2>
          <p className="text-lg text-neutral-400">
            {tr(
              "O Dorsal Screen é uma janela pequena com a tela em 3D, o zoom e dois botões: escolher a imagem e enviar.",
              "Dorsal Screen is a small window with the screen in 3D, the zoom and two buttons: choose the image and send.",
            )}
          </p>
          <ButtonLink href={MINI_APPIMAGE} download={MINI_FILE} variant="outline" size="lg" className="w-fit">
            <Download className="size-4" /> {tr("Baixar o Dorsal Screen", "Download Dorsal Screen")}
          </ButtonLink>
        </ScrollReveal>
        <ScrollReveal delay={0.12} y={24}>
          <img src={shot(lang, "mini.png")} alt={tr("O Dorsal Screen: a tela do teclado em 3D, o zoom e os botões de enviar", "Dorsal Screen: the keyboard's screen in 3D, the zoom and the send buttons")} loading="lazy" className="mx-auto w-full max-w-[420px]" />
        </ScrollReveal>
      </div>
    </section>
  );
}

const UDEV_SCRIPT = `${SITE}/udev.sh`;
const UDEV_COMMAND = `curl -fsSL ${UDEV_SCRIPT} | sudo sh`;

function Install() {
  const lang = useLang();
  const tr = useTr();
  const [which, setWhich] = useState<"full" | "mini">("full");
  const file = which === "full" ? APPIMAGE_FILE : MINI_FILE;
  return (
    <section id="install" className="border-t border-white/[0.05]">
      <div className="mx-auto max-w-[1180px] px-5 py-20">
        <ScrollReveal>
          <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[40px]">{tr("Dois jeitos de usar.", "Two ways to use it.")}</h2>
          <p className="mt-4 max-w-[62ch] text-lg text-neutral-400">
            {tr("Os dois precisam da mesma regra de acesso no Linux, uma vez só.", "Both need the same Linux access rule, just once.")}
          </p>
        </ScrollReveal>

        <div className="mt-12 flex flex-col gap-4">
          <Step n={1} delay={0} title={tr("Libere o teclado no Linux", "Give Linux access to the keyboard")}>
            <p className="max-w-[72ch]">
              {tr(
                "Por padrão, só o root fala com o teclado; é por isso que o qmk.top não funciona no Linux. Rode no terminal, uma vez só, e reconecte o cabo:",
                "By default only root can talk to the keyboard; that is why qmk.top does not work on Linux. Run this in a terminal, just once, and replug the cable:",
              )}
            </p>
            <Terminal command={UDEV_COMMAND} />
            <p className="text-sm text-neutral-500">
              {tr("O script só cria a regra de acesso do udev. ", "The script only creates the udev access rule. ")}
              {/* The page's own copy, so it opens on localhost and previews too. */}
              <a href="/udev.sh" target="_blank" rel="noreferrer" className="text-neutral-300 underline decoration-white/20 underline-offset-4 hover:text-white">
                {tr("Ler o script", "Read the script")}
              </a>
            </p>
          </Step>
          <Step n={2} delay={0.14} title={tr("Escolha como abrir", "Choose how to open it")}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
              <div className="flex flex-col gap-3 rounded-2xl bg-white/[0.03] p-5">
                <h4 className="flex items-center gap-2 font-medium text-neutral-100">
                  <Globe className="size-4" /> {tr("No navegador", "In the browser")}
                </h4>
                <p className="text-sm">
                  {tr(
                    "Nada para instalar. Abra no Chrome, Edge, Chromium ou Brave, clique em Conectar teclado e escolha Gaming Keyboard.",
                    "Nothing to install. Open it in Chrome, Edge, Chromium or Brave, click Connect keyboard and pick Gaming Keyboard.",
                  )}
                </p>
                <ButtonLink href={appPath(lang)} onClick={go(appPath(lang))} variant="primary" size="md" className="mt-auto">
                  {tr("Abrir o app", "Open the app")}
                </ButtonLink>
              </div>
              <div className="flex min-w-0 flex-col gap-3 rounded-2xl bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="flex items-center gap-2 font-medium text-neutral-100">
                    <Download className="size-4" /> AppImage
                  </h4>
                  <Tabs value={which} onValueChange={(v) => setWhich(v as "full" | "mini")} variant="segment">
                    <TabsList className="bg-white/[0.05]">
                      <TabsTrigger value="full">{PRODUCT}</TabsTrigger>
                      <TabsTrigger value="mini">Dorsal Screen</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <p className="text-sm">
                  {which === "full"
                    ? tr("O app completo, numa janela própria.", "The full app, in its own window.")
                    : tr("Só a tela do teclado, numa janela pequena.", "Just the keyboard's screen, in a small window.")}
                </p>
                <ButtonLink href={which === "full" ? APPIMAGE : MINI_APPIMAGE} download={file} variant="secondary" size="md" className="w-fit">
                  <Download className="size-4" /> {file}
                </ButtonLink>
                <p className="text-sm">{tr("Depois de baixar, rode no terminal:", "Once downloaded, run in a terminal:")}</p>
                <Terminal command={`chmod +x ~/Downloads/${file} && ~/Downloads/${file}`} />
              </div>
            </div>
          </Step>
        </div>
      </div>
    </section>
  );
}

function Step({ n, title, delay, children }: { n: number; title: string; delay: number; children: ReactNode }) {
  return (
    <ScrollReveal delay={delay} y={24} className="flex min-w-0">
      <Card className="min-w-0 flex-1 border-white/[0.07] bg-[#101112] text-[15px] text-neutral-400">
        <CardHeader>
          <span className="num grid size-8 place-items-center rounded-full border border-white/15 text-sm font-semibold text-neutral-200">{n}</span>
          <CardTitle as="h3" className="mt-2 text-xl font-semibold text-neutral-100">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">{children}</CardContent>
      </Card>
    </ScrollReveal>
  );
}

function Terminal({ command }: { command: string }) {
  const tr = useTr();
  const [state, setState] = useState("copy");
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl bg-black/50 py-1.5 pl-4 pr-1.5 ring-1 ring-white/[0.06]">
      <code className="min-w-0 flex-1 whitespace-pre-wrap py-1 font-mono [overflow-wrap:anywhere] text-[13px] leading-6 text-neutral-100">
        <span className="select-none text-[#5fd0e6]">$ </span>
        {command}
      </code>
      <ActionSwapBlurButton
        size="sm"
        variant="ghost"
        value={state}
        items={[
          { id: "copy", label: tr("Copiar", "Copy"), icon: <Copy className="size-3.5" /> },
          { id: "done", label: tr("Copiado", "Copied"), icon: <Check className="size-3.5 text-[#5fd0e6]" /> },
        ]}
        onClick={() => {
          void navigator.clipboard?.writeText(command);
          setState("done");
          setTimeout(() => setState("copy"), 2000);
        }}
        className="shrink-0"
      />
    </div>
  );
}

interface Question {
  icon: ReactNode;
  q: [string, string];
  a: [ReactNode, ReactNode];
}

const code = (text: string) => <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[13px] text-neutral-200">{text}</code>;
const strong = (text: string) => <strong className="font-medium text-neutral-200">{text}</strong>;

const QUESTIONS: Question[] = [
  {
    icon: <TerminalIcon />,
    q: ["Por que o qmk.top não funcionava no meu Linux?", "Why did qmk.top not work on my Linux?"],
    a: [
      <>O site fala com o teclado pelo navegador (WebHID), e o Linux só deixa o root abrir esse tipo de dispositivo. A regra de acesso do passo 1 dá esse direito ao seu usuário. Com ela, até o qmk.top passa a abrir.</>,
      <>The site talks to the keyboard through the browser (WebHID), and Linux only lets root open that kind of device. The access rule from step 1 gives that right to your user. With it, even qmk.top opens.</>,
    ],
  },
  {
    icon: <PackageOpen />,
    q: ["Preciso instalar algum driver ou biblioteca para usar no navegador?", "Do I need to install a driver or library to use it in the browser?"],
    a: [
      <>Não. O navegador conversa direto com o teclado. No Linux, basta rodar uma vez o comando do passo 1.</>,
      <>No. The browser talks to the keyboard directly. On Linux, just run the command from step 1 once.</>,
    ],
  },
  {
    icon: <ArchiveRestore />,
    q: ["Como faço e restauro um backup?", "How do I back up and restore?"],
    a: [
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:text-neutral-500">
        <li>Em {strong("Sistema → Backup")}, {strong("Baixar backup")} salva teclas, luz e ajustes num arquivo {code(".json")}.</li>
        <li>Para voltar, clique em {strong("Restaurar backup")} e escolha o arquivo.</li>
        <li>O {PRODUCT} compara com o teclado, mostra o que vai mudar e só grava a diferença depois que você confirma.</li>
      </ol>,
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:text-neutral-500">
        <li>In {strong("System → Backup")}, {strong("Download backup")} saves keys, lighting and settings to a {code(".json")} file.</li>
        <li>To go back, click {strong("Restore backup")} and pick the file.</li>
        <li>{PRODUCT} compares it with the keyboard, shows what will change and writes only the difference once you confirm.</li>
      </ol>,
    ],
  },
  {
    icon: <Usb />,
    q: ["Funciona pelo dongle 2.4G?", "Does it work over the 2.4G dongle?"],
    a: [
      <>Não. Pelo dongle o teclado não responde aos comandos de configuração, e a tela só aceita imagens pelo cabo. Para configurar, ligue o {strong("cabo USB")}; o dongle pode continuar conectado.</>,
      <>No. Over the dongle the keyboard does not answer configuration commands, and the screen only takes images over the cable. To configure it, plug in the {strong("USB cable")}; the dongle can stay connected.</>,
    ],
  },
  {
    icon: <ShieldCheck />,
    q: ["Pode estragar o teclado?", "Can it break the keyboard?"],
    a: [
      <>O {PRODUCT} nunca atualiza o firmware. Tudo o que ele muda pode ser desfeito: dá para restaurar um backup ou voltar ao padrão de fábrica.</>,
      <>{PRODUCT} never updates the firmware. Everything it changes can be undone: you can restore a backup or go back to factory defaults.</>,
    ],
  },
  {
    icon: <Languages />,
    q: ["Tem em inglês?", "Is it available in Portuguese?"],
    a: [
      <>Sim. O site, o app e o Dorsal Screen têm português e inglês: troque no seletor {strong("PT / EN")} no topo. Por padrão, abrem no idioma do sistema.</>,
      <>Yes. The site, the app and Dorsal Screen come in English and Portuguese: switch with the {strong("PT / EN")} selector at the top. By default they open in your system's language.</>,
    ],
  },
  {
    icon: <Laptop />,
    q: ["Funciona no Windows ou no macOS?", "Does it work on Windows or macOS?"],
    a: [
      <>No navegador, sim: Chrome e Edge têm WebHID, e lá não é preciso nenhuma regra de acesso. O AppImage é só para Linux.</>,
      <>In the browser, yes: Chrome and Edge have WebHID, and no access rule is needed there. The AppImage is Linux only.</>,
    ],
  },
  {
    icon: <BadgeInfo />,
    q: ["É oficial?", "Is it official?"],
    a: [
      <>Não. É um projeto independente e aberto, feito a partir do protocolo que o próprio teclado usa, sem relação com a Attack Shark.</>,
      <>No. It is an independent, open project, built on the protocol the keyboard itself speaks, not affiliated with Attack Shark.</>,
    ],
  },
];

function Questions() {
  const lang = useLang();
  const tr = useTr();
  const i = lang === "en" ? 1 : 0;
  return (
    <section id="questions" className="border-t border-white/[0.05]">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-20 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:grid-rows-[auto_1fr] lg:gap-y-8">
        <ScrollReveal>
          <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[40px]">{tr("Perguntas.", "Questions.")}</h2>
          <p className="mt-4 max-w-[36ch] text-lg text-neutral-400">{tr("O que mais perguntam antes de instalar.", "What people ask most before installing.")}</p>
        </ScrollReveal>
        <ScrollReveal delay={0.2} className="order-last lg:order-none lg:col-start-1 lg:row-start-2 lg:self-start">
          <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-[#101112] p-5">
            <span className="grid size-9 place-items-center rounded-xl bg-[#5fd0e6]/10 text-[#5fd0e6]">
              <MessageCircleQuestion className="size-[18px]" />
            </span>
            <p className="text-[15px] font-medium text-neutral-100">{tr("Não achou sua pergunta?", "Didn't find your question?")}</p>
            <p className="text-sm text-neutral-400">{tr("Abra uma issue no GitHub: dúvidas, erros e ideias são bem-vindos.", "Open an issue on GitHub: questions, bugs and ideas are welcome.")}</p>
            <ButtonLink href={`${REPO}/issues`} target="_blank" rel="noreferrer" variant="secondary" size="md" className="mt-1 w-fit">
              {tr("Abrir uma issue", "Open an issue")}
            </ButtonLink>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={0.12} y={24} className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <BouncyAccordion
            items={QUESTIONS.map((q, n) => ({ id: String(n), icon: q.icon, title: q.q[i], description: q.a[i] }))}
            classNames={{
              item: "bg-[#121315]",
              trigger: "min-h-[60px]",
              icon: "size-8 rounded-lg bg-white/[0.05] text-neutral-300 [&_svg]:size-4",
              title: "whitespace-normal text-base text-neutral-100",
              description: "pl-12 text-neutral-400",
            }}
          />
        </ScrollReveal>
      </div>
    </section>
  );
}
