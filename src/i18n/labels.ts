// English names for the Portuguese labels that come from the protocol tables (key names,
// functions, light effects, the knob column, picker groups). Portuguese is the source.

import type { Lang } from "./index";
import { keyLabel, keyShortLabel } from "../protocol/keycodes";

const EN: Record<string, string> = {
  // keys
  Espaço: "Space",
  // functions
  Mudo: "Mute",
  "Próxima faixa": "Next track",
  "Faixa anterior": "Previous track",
  Parar: "Stop",
  Calculadora: "Calculator",
  "Meu computador": "My computer",
  Pesquisar: "Search",
  "Página inicial (navegador)": "Browser home",
  "Voltar (navegador)": "Browser back",
  "Atualizar (navegador)": "Browser refresh",
  "Brilho do monitor −": "Monitor brightness −",
  "Brilho do monitor +": "Monitor brightness +",
  "Bluetooth 1 (segure: parear)": "Bluetooth 1 (hold: pair)",
  "Bluetooth 2 (segure: parear)": "Bluetooth 2 (hold: pair)",
  "Bluetooth 3 (segure: parear)": "Bluetooth 3 (hold: pair)",
  "Receptor 2.4G (segure: parear)": "2.4G receiver (hold: pair)",
  "Luz: próximo efeito": "Light: next effect",
  "Luz: mais brilho": "Light: brighter",
  "Luz: menos brilho": "Light: dimmer",
  "Luz: mais devagar": "Light: slower",
  "Luz: mais rápido": "Light: faster",
  "Luz: próxima cor": "Light: next colour",
  "Luz: apagar/acender": "Light: off/on",
  "Travar a tecla Super": "Lock the Super key",
  "Restaurar fábrica (segure 3 s)": "Factory reset (hold 3 s)",
  "Ver a bateria (sem fio)": "Check battery (wireless)",
  "Área de trabalho (Super+D)": "Show desktop (Super+D)",
  "Alternar janelas (Super+Tab)": "Switch windows (Super+Tab)",
  "Desligar PC": "Power off PC",
  "Suspender PC": "Sleep PC",
  "Acordar PC": "Wake PC",
  "Bloquear tela (Super+L)": "Lock screen (Super+L)",
  "Clique esquerdo": "Left click",
  "Clique direito": "Right click",
  "Clique do meio": "Middle click",
  "Botão 4 do mouse": "Mouse button 4",
  "Botão 5 do mouse": "Mouse button 5",
  Desativada: "Disabled",
  // short labels
  Efeito: "Effect",
  "Luz +": "Light +",
  "Luz −": "Light −",
  "Vel. −": "Speed −",
  "Vel. +": "Speed +",
  "Trava Super": "Super lock",
  Cor: "Colour",
  Bateria: "Battery",
  Janelas: "Windows",
  Luz: "Light",
  // light effects
  Desligado: "Off",
  "Sempre aceso": "Always on",
  Respiração: "Breathing",
  Onda: "Wave",
  Ondulação: "Ripple",
  "Gota de chuva": "Raindrop",
  Cobra: "Snake",
  "Reação ao toque": "Reactive",
  Convergência: "Converge",
  "Onda senoidal": "Sine wave",
  Caleidoscópio: "Kaleidoscope",
  Linhas: "Lines",
  "Onda circular": "Circular wave",
  "Arco-íris": "Rainbow",
  Chuva: "Rain",
  Meteoro: "Meteor",
  "Toque (apaga)": "Reactive (off)",
  Trem: "Train",
  Fogos: "Fireworks",
  // knob column
  "Knob: apertar": "Knob: press",
  "Knob: girar à esquerda": "Knob: turn left",
  "Knob: girar à direita": "Knob: turn right",
  "Extra 1 (tela)": "Extra 1 (screen)",
  "Extra 2 (tela)": "Extra 2 (screen)",
  "Extra 3 (tela)": "Extra 3 (screen)",
  // picker groups
  Letras: "Letters",
  Números: "Numbers",
  Símbolos: "Symbols",
  Edição: "Editing",
  Setas: "Arrows",
  Modificadores: "Modifiers",
  "Teclado numérico": "Numpad",
};

export function labelIn(lang: Lang, pt: string): string {
  if (lang === "pt") return pt;
  if (EN[pt]) return EN[pt];
  // Composite labels: "Ctrl+Espaço", "Tela 3.0", the "não identificada" names.
  return pt
    .replace(/Espaço/g, "Space")
    .replace(/^Tela (\d)/, "Screen $1")
    .replace(/^Mídia /, "Media ")
    .replace(/^Função do sistema não identificada/, "Unidentified system function")
    .replace(/^Função de luz não identificada/, "Unidentified light function")
    .replace(/^Conexão não identificada/, "Unidentified connection");
}

export const keyName = (lang: Lang, v: ArrayLike<number>) => labelIn(lang, keyLabel(v));
export const keyShortName = (lang: Lang, v: ArrayLike<number>) => labelIn(lang, keyShortLabel(v));
