// Landing page: what the configurator does, shown with the app's own 3D board running in
// demo mode, how to use it in the browser and how to install it on Linux.

import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Download, Globe } from "lucide-react";
import { Board3D, type Framing } from "../app/Board3D";
import { FACTORY_BASE } from "../layout/x85-factory";
import { drawClockFace } from "../screen/clockFace";
import { SCREEN_H, SCREEN_W } from "../screen/send";
import type { LightSetting } from "../protocol/x85";
import { useLang, useTr, type Lang } from "../i18n";
import { keyShortName } from "../i18n/labels";
import { navigate, pathOf } from "../router";
import { Logo, PRODUCT } from "../brand";
import { cn } from "@/lib/utils";
import { ButtonLink } from "@/components/motion/button/base";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/motion/card";
import { BouncyAccordion } from "@/components/motion/bouncy-accordion";
import { ActionSwapBlurButton } from "@/components/motion/action-swap-blur";
import { TextReveal } from "@/components/motion/text-reveal";
import { SharedLayoutBg } from "@/components/motion/shared-layout-bg";
import { ScrollReveal } from "@/components/motion/scroll-reveal";

const VERSION = "0.1.0";
// Where the AppImages are downloaded from: the site's root by default, or another host
// (a release page, a CDN) set in VITE_DOWNLOAD_BASE at build time.
const DOWNLOAD_BASE = (import.meta.env.VITE_DOWNLOAD_BASE ?? "").replace(/\/$/, "");
const APPIMAGE_FILE = `Dorsal-${VERSION}.AppImage`;
const MINI_FILE = `Dorsal-Screen-${VERSION}.AppImage`;
const APPIMAGE = `${DOWNLOAD_BASE}/${APPIMAGE_FILE}`;
const MINI_APPIMAGE = `${DOWNLOAD_BASE}/${MINI_FILE}`;
const UDEV =
  `echo 'KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="3151", ATTRS{idProduct}=="5002|5006", TAG+="uaccess"' | sudo tee /etc/udev/rules.d/70-attack-shark-x85.rules && sudo udevadm control --reload && sudo udevadm trigger --subsystem-match=hidraw`;

const VIEWS: { id: Framing; pt: string; en: string; capPt: string; capEn: string }[] = [
  { id: "screen", pt: "Tela", en: "Screen", capPt: "A TFT mostra o relógio de fábrica ou a sua imagem.", capEn: "The TFT shows the factory clock or your image." },
  { id: "keys", pt: "Teclas", en: "Keys", capPt: "Clique numa tecla para trocar o que ela faz.", capEn: "Click a key to change what it does." },
  { id: "light", pt: "Iluminação", en: "Lighting", capPt: "Os efeitos animam no 3D antes de ir para o teclado.", capEn: "Effects play in 3D before they reach the keyboard." },
  { id: "system", pt: "Sistema", en: "System", capPt: "Polling, debounce, bateria e reset de fábrica.", capEn: "Polling, debounce, battery and factory reset." },
];
// A rainbow wave on the keys and the side band, to show the lighting preview.
const DEMO_LIGHT: LightSetting = { mode: 4, speed: 2, brightness: 3, rainbow: true, rgb: { r: 250, g: 255, b: 250 } };
const DEMO_SIDE: LightSetting = { mode: 4, speed: 2, brightness: 4, rainbow: true, rgb: { r: 250, g: 255, b: 250 } };

/** The configurator in the browser (WebHID), in the page's language. */
const appPath = (lang: Lang) => pathOf({ lang, page: "app", section: "screen" });
const go = (path: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  navigate(path, { fade: true });
};

export function LandingApp() {
  const tr = useTr();
  useEffect(() => {
    document.title = tr(`${PRODUCT}: o X85 Pro configurado no Linux`, `${PRODUCT}: the X85 Pro, configured on Linux`);
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
        <span>{tr("Projeto independente, sem relação com a Attack Shark.", "Independent project, not affiliated with Attack Shark.")}</span>
      </footer>
    </div>
  );
}

const NAV = [
  { id: "recursos", pt: "Recursos", en: "Features" },
  { id: "instalar", pt: "Instalar", en: "Install" },
  { id: "perguntas", pt: "Perguntas", en: "Questions" },
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
          {/* beUI: a pill glides behind the link under the pointer; the section in view is lit. */}
          <SharedLayoutBg className="w-auto flex-row items-center gap-1" inset={0} pillClassName="rounded-lg bg-white/[0.07]">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} aria-current={active === n.id ? "true" : undefined} className={cn("block rounded-lg px-3 py-1.5 transition-colors", active === n.id ? "text-white" : "text-neutral-400 hover:text-white")}>
                {tr(n.pt, n.en)}
              </a>
            ))}
          </SharedLayoutBg>
        </nav>
        <div className="flex items-center gap-3">
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
        {/* The page's one orchestrated moment: the headline arrives word by word. */}
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
          <ButtonLink href={APPIMAGE} variant="outline" size="lg">
            <Download className="size-4" /> {tr("Baixar o AppImage", "Download the AppImage")}
          </ButtonLink>
        </div>
      </div>

      {/* Linear fades on all four edges reach full transparency, so the board's soft shadow
          never ends on the stage's edge; the two masks intersect. */}
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
          sideLight={view === "light" ? DEMO_SIDE : undefined}
          fallback={<img src="/landing/keys.png" alt={tr("O configurador mostrando o teclado de cima", "The configurator showing the keyboard from above")} className="mx-auto h-full object-contain" />}
        />
        {/* As in the app: over the TFT the rest of the board falls into shadow. */}
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
    image: "/landing/screen.png",
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
    image: "/landing/keys.png",
    alt: ["A seção Teclas: o teclado visto de cima com as legendas", "The Keys section: the keyboard from above with its legends"],
  },
  {
    id: "luz",
    title: ["Veja o efeito antes de aplicar.", "See the effect before you apply it."],
    text: ["Os 21 efeitos das teclas e os 5 da luz lateral animam no modelo 3D. O teclado só muda quando você aplicar.", "The 21 key effects and the 5 side-light effects play on the 3D model. The keyboard only changes when you apply."],
    points: [
      ["Arco-íris, cores prontas ou qualquer cor", "Rainbow, ready colours or any colour"],
      ["Brilho e velocidade", "Brightness and speed"],
      ["Luz lateral com efeito próprio", "Side light with its own effect"],
      ["Um só botão aplica tudo", "One button applies it all"],
    ],
    image: "/landing/light.png",
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
    image: "/landing/system.png",
    alt: ["A seção Sistema: o teclado de lado e os cartões de resposta, bateria e reset", "The System section: the keyboard from the side and the response, battery and reset cards"],
  },
] as const;

function Features() {
  const lang = useLang();
  const i = lang === "en" ? 1 : 0;
  return (
    <section id="recursos" className="border-t border-white/[0.05]">
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
              <img src={f.image} alt={f.alt[i]} loading="lazy" className="block w-full" />
            </figure>
          </ScrollReveal>
        </article>
      ))}
    </section>
  );
}

function Mini() {
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
          <ButtonLink href={MINI_APPIMAGE} variant="outline" size="lg" className="w-fit">
            <Download className="size-4" /> {tr("Baixar o Dorsal Screen", "Download Dorsal Screen")}
          </ButtonLink>
        </ScrollReveal>
        <ScrollReveal delay={0.12} y={24}>
          <img src="/landing/mini.png" alt={tr("O Dorsal Screen: a tela do teclado em 3D, o zoom e os botões de enviar", "Dorsal Screen: the keyboard's screen in 3D, the zoom and the send buttons")} loading="lazy" className="mx-auto w-full max-w-[420px]" />
        </ScrollReveal>
      </div>
    </section>
  );
}

function Install() {
  const lang = useLang();
  const tr = useTr();
  return (
    <section id="instalar" className="border-t border-white/[0.05]">
      <div className="mx-auto max-w-[1180px] px-5 py-20">
        <ScrollReveal>
          <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[40px]">{tr("Dois jeitos de usar.", "Two ways to use it.")}</h2>
          <p className="mt-4 max-w-[62ch] text-lg text-neutral-400">
            {tr("Os dois precisam da mesma regra de acesso no Linux, uma vez só.", "Both need the same Linux access rule, just once.")}
          </p>
        </ScrollReveal>

        <div className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Step n={1} delay={0} title={tr("Libere o teclado no Linux", "Give Linux access to the keyboard")}>
            <p>
              {tr(
                "Por padrão, só o root fala com o teclado; é por isso que o qmk.top não funciona no Linux. Rode no terminal e reconecte o cabo:",
                "By default only root can talk to the keyboard; that is why qmk.top does not work on Linux. Run this in a terminal and replug the cable:",
              )}
            </p>
            <CopyCommand command={UDEV} />
          </Step>
          <Step n={2} delay={0.14} title={tr("Escolha como abrir", "Choose how to open it")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-2xl bg-white/[0.03] p-4">
                <h4 className="flex items-center gap-2 font-medium text-neutral-100">
                  <Globe className="size-4" /> {tr("No navegador", "In the browser")}
                </h4>
                <p className="text-sm">{tr("Chrome, Edge, Chromium ou Brave. Nada para instalar.", "Chrome, Edge, Chromium or Brave. Nothing to install.")}</p>
                <ButtonLink href={appPath(lang)} onClick={go(appPath(lang))} variant="primary" size="md" className="mt-auto">
                  {tr("Abrir o app", "Open the app")}
                </ButtonLink>
              </div>
              <div className="flex flex-col gap-3 rounded-2xl bg-white/[0.03] p-4">
                <h4 className="flex items-center gap-2 font-medium text-neutral-100">
                  <Download className="size-4" /> AppImage
                </h4>
                <CopyCommand command={`chmod +x ${APPIMAGE_FILE} && ./${APPIMAGE_FILE}`} />
                <div className="mt-auto flex flex-wrap gap-2">
                  <ButtonLink href={APPIMAGE} variant="secondary" size="md">
                    {PRODUCT}
                  </ButtonLink>
                  <ButtonLink href={MINI_APPIMAGE} variant="ghost" size="md">
                    Dorsal Screen
                  </ButtonLink>
                </div>
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

/** A command to paste in a terminal; the copy button swaps its label when it is done. */
function CopyCommand({ command }: { command: string }) {
  const tr = useTr();
  const [state, setState] = useState("copy");
  return (
    <div className="flex items-center gap-2 rounded-xl bg-black/50 py-1.5 pl-3 pr-1.5 ring-1 ring-white/[0.06]">
      <code className="scrollbar-hide min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px] leading-7 text-neutral-200">{command}</code>
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

const QUESTIONS: [string, string, string, string][] = [
  [
    "Por que o qmk.top não funcionava no meu Linux?",
    "O site fala com o teclado pelo navegador (WebHID), e o Linux só deixa o root abrir esse tipo de dispositivo. A regra de acesso dá esse direito ao seu usuário. Com ela, até o qmk.top passa a abrir.",
    "Why did qmk.top not work on my Linux?",
    "The site talks to the keyboard through the browser (WebHID), and Linux only lets root open that kind of device. The access rule gives that right to your user. With it, even qmk.top opens.",
  ],
  [
    "Funciona pelo dongle 2.4G?",
    "A tela só aceita imagens pelo cabo USB, por limitação do firmware. As outras configurações pelo dongle ainda não estão prontas; use o cabo para configurar.",
    "Does it work over the 2.4G dongle?",
    "The screen only takes images over the USB cable, a firmware limit. The other settings over the dongle are not ready yet; use the cable to configure.",
  ],
  [
    "Pode estragar o teclado?",
    "Não atualiza firmware. Tudo o que muda pode ser desfeito: dá para guardar um backup e voltar ao padrão de fábrica.",
    "Can it break the keyboard?",
    "It never updates firmware. Everything it changes can be undone: you can keep a backup and go back to factory defaults.",
  ],
  [
    "Funciona no Windows ou no macOS?",
    "No navegador, sim: Chrome e Edge têm WebHID. O AppImage e a regra de acesso são para Linux.",
    "Does it work on Windows or macOS?",
    "In the browser, yes: Chrome and Edge have WebHID. The AppImage and the access rule are for Linux.",
  ],
  [
    "É oficial?",
    "Não. É um projeto independente, feito a partir do protocolo que o próprio teclado usa, sem relação com a Attack Shark.",
    "Is it official?",
    "No. It is an independent project, built on the protocol the keyboard itself speaks, not affiliated with Attack Shark.",
  ],
];

function Questions() {
  const lang = useLang();
  const tr = useTr();
  const en = lang === "en";
  return (
    <section id="perguntas" className="border-t border-white/[0.05]">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-20 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <ScrollReveal>
          <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[40px]">{tr("Perguntas.", "Questions.")}</h2>
        </ScrollReveal>
        <ScrollReveal delay={0.12} y={24}>
          <BouncyAccordion
            items={QUESTIONS.map(([qp, ap, qe, ae], i) => ({ id: String(i), title: en ? qe : qp, description: en ? ae : ap }))}
            classNames={{ item: "bg-[#121315]", title: "whitespace-normal text-base text-neutral-100", description: "text-neutral-400" }}
          />
        </ScrollReveal>
      </div>
    </section>
  );
}
