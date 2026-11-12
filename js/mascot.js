// Tarsi – das Maskottchen der App: ein Koboldmaki (Tarsier) von den Philippinen mit riesigen Augen.
// Reines Inline-SVG, Stimmungen: happy, cheer, think, sad, sleep, wave, proud.
import { h } from "./ui.js";

const FUR = "#c98f5e", FUR_D = "#a8703f", LIGHT = "#f6dfbd", IRIS = "#f5a623", IRIS_D = "#d9821a", PUPIL = "#2b1a0e", PINK = "#ff9db0", INK = "#5a341b";

function eyes(mood) {
  const eye = (cx, look = [0, 0]) => {
    const [dx, dy] = look;
    return `<circle cx="${cx}" cy="52" r="14" fill="#fff8ec"/>
      <circle cx="${cx}" cy="52" r="12.5" fill="${IRIS}"/>
      <circle cx="${cx}" cy="52" r="12.5" fill="none" stroke="${IRIS_D}" stroke-width="1.5"/>
      <circle cx="${cx + dx}" cy="${52 + dy}" r="7.5" fill="${PUPIL}"/>
      <circle cx="${cx + dx - 3}" cy="${52 + dy - 3.5}" r="2.8" fill="#fff"/>
      <circle cx="${cx + dx + 2.5}" cy="${52 + dy + 2.5}" r="1.2" fill="#fff" opacity=".8"/>`;
  };
  const closedHappy = (cx) => `<path d="M${cx - 10} 54 Q${cx} 42 ${cx + 10} 54" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>`;
  const closedSleep = (cx) => `<path d="M${cx - 9} 53 Q${cx} 59 ${cx + 9} 53" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  switch (mood) {
    case "cheer": case "proud": return closedHappy(45) + closedHappy(75);
    case "sleep": return closedSleep(45) + closedSleep(75);
    case "think": return eye(45, [3, -4]) + eye(75, [3, -4]);
    case "sad": return eye(45, [0, 3.5]) + eye(75, [0, 3.5]) +
      `<path d="M33 41 L51 35" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M87 41 L69 35" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
    default: return eye(45) + eye(75);
  }
}

function mouth(mood) {
  switch (mood) {
    case "cheer": return `<path d="M52 68 Q60 79 68 68 Z" fill="#8a3b2a"/><path d="M55 72 Q60 76 65 72" fill="${PINK}"/>`;
    case "think": return `<ellipse cx="62" cy="70" rx="2.6" ry="2.2" fill="#8a3b2a"/>`;
    case "sad": return `<path d="M54 72 Q60 67 66 72" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
    case "sleep": return `<ellipse cx="60" cy="70" rx="2" ry="1.6" fill="#8a3b2a"/>`;
    default: return `<path d="M54 68 Q60 74 66 68" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
  }
}

function arms(mood) {
  const paw = (x, y) => `<circle cx="${x}" cy="${y}" r="5.5" fill="${FUR}"/><circle cx="${x - 3}" cy="${y - 4}" r="2" fill="${FUR}"/><circle cx="${x + 3}" cy="${y - 4}" r="2" fill="${FUR}"/>`;
  switch (mood) {
    case "cheer":
      return `<path d="M40 86 Q26 74 22 58" stroke="${FUR}" stroke-width="7" fill="none" stroke-linecap="round"/>${paw(22, 56)}
        <path d="M80 86 Q94 74 98 58" stroke="${FUR}" stroke-width="7" fill="none" stroke-linecap="round"/>${paw(98, 56)}`;
    case "wave":
      return `${paw(48, 98)}<path d="M80 86 Q96 78 98 62" stroke="${FUR}" stroke-width="7" fill="none" stroke-linecap="round"/>${paw(98, 60)}`;
    case "think":
      return `${paw(50, 98)}<path d="M76 90 Q76 80 70 76" stroke="${FUR}" stroke-width="7" fill="none" stroke-linecap="round"/>${paw(68, 76)}`;
    case "proud":
      return `${paw(48, 98)}${paw(72, 98)}<rect x="47" y="90" width="26" height="16" rx="2" fill="#4f9cf9"/><rect x="47" y="90" width="13" height="16" rx="2" fill="#7db7ff"/><path d="M60 90 V106" stroke="#2f6fc4" stroke-width="1.5"/>`;
    default:
      return `${paw(48, 98)}${paw(72, 98)}`;
  }
}

function extras(mood) {
  switch (mood) {
    case "cheer": return `<g fill="#ffcf48"><path d="M12 30 l2.5 5 5 .7 -3.7 3.5 .9 5 -4.7 -2.5 -4.7 2.5 .9 -5 -3.7 -3.5 5 -.7z"/><path d="M108 22 l2 4 4 .6 -3 2.8 .7 4 -3.7 -2 -3.7 2 .7 -4 -3 -2.8 4 -.6z"/></g>`;
    case "think": return `<circle cx="100" cy="26" r="3" fill="#b9c7d6"/><circle cx="108" cy="16" r="4.5" fill="#b9c7d6"/>`;
    case "sad": return `<path d="M33 62 q-3 5 0 7 q3 -2 0 -7z" fill="#7cc3ff"/>`;
    case "sleep": return `<text x="92" y="28" font-family="ui-rounded, system-ui, sans-serif" font-weight="800" font-size="13" fill="#8aa0b8">z</text><text x="102" y="18" font-family="ui-rounded, system-ui, sans-serif" font-weight="800" font-size="17" fill="#8aa0b8">Z</text>`;
    default: return "";
  }
}

export function mascotSvg(mood = "happy") {
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tarsi, der Koboldmaki">
    <ellipse cx="60" cy="114" rx="30" ry="4" fill="#000" opacity=".08"/>
    <path d="M84 100 Q112 104 110 80 Q108 66 100 72" stroke="${FUR_D}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <ellipse cx="60" cy="94" rx="27" ry="21" fill="${FUR}"/>
    <ellipse cx="60" cy="98" rx="16" ry="13" fill="${LIGHT}"/>
    <ellipse cx="25" cy="27" rx="13" ry="16" fill="${FUR}" transform="rotate(-22 25 27)"/>
    <ellipse cx="25" cy="28" rx="7.5" ry="10" fill="${PINK}" opacity=".55" transform="rotate(-22 25 28)"/>
    <ellipse cx="95" cy="27" rx="13" ry="16" fill="${FUR}" transform="rotate(22 95 27)"/>
    <ellipse cx="95" cy="28" rx="7.5" ry="10" fill="${PINK}" opacity=".55" transform="rotate(22 95 28)"/>
    <circle cx="60" cy="52" r="35" fill="${FUR}"/>
    <path d="M44 22 q4 -6 8 0 q4 -6 8 0 q4 -6 8 0" fill="${FUR_D}" opacity=".35"/>
    <ellipse cx="60" cy="58" rx="29" ry="25" fill="${LIGHT}"/>
    <ellipse cx="34" cy="68" rx="5.5" ry="3.2" fill="${PINK}" opacity=".55"/>
    <ellipse cx="86" cy="68" rx="5.5" ry="3.2" fill="${PINK}" opacity=".55"/>
    ${eyes(mood)}
    <ellipse cx="60" cy="64" rx="3" ry="2.2" fill="#7a4526"/>
    ${mouth(mood)}
    ${arms(mood)}
    ${extras(mood)}
  </svg>`;
}

/** Maskottchen-Element. size in px, anim: "bounce" | "wiggle" | "" */
export function mascot(mood = "happy", size = 96, anim = "") {
  return h("span.mascot" + (anim ? "." + anim : ""), { style: { width: size + "px", height: size + "px" }, html: mascotSvg(mood) });
}

/** Maskottchen mit Sprechblase. */
export function tarsiSays(text, mood = "happy", size = 84) {
  return h("div.tarsi-says", mascot(mood, size, "bounce"), h("div.speech", text));
}

// ---------- Sprüche ----------
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function greetingLine({ name, streak, activeToday, xpToday, goal, dayNum, daysLeft, firstTime }) {
  const n = name ? `, ${name}` : "";
  const hour = new Date().getHours();
  if (firstTime) return `Hallo${n}! Ich bin Tarsi, ein Koboldmaki von den Philippinen. Ich begleite dich bis zur Prüfung. Fangen wir mit einem kleinen Test an? 🧭`;
  if (daysLeft === 0) return `Heute ist der große Tag${n}! Atme tief durch – du bist so gut vorbereitet. Ich drück dir alle zehn Finger! 🍀`;
  if (daysLeft === 1) return `Morgen ist Prüfung! Heute nur noch locker wiederholen und früh schlafen. Du schaffst das! 💛`;
  if (xpToday >= goal) return pick([`Tagesziel geschafft${n}! Ich bin so stolz auf dich. 🎉`, `Wow, heute warst du richtig fleißig! Gönn dir eine Pause. ☕`, `Ziel erreicht! Jede Übung bringt dich näher an den 12.12. ✨`]);
  if (activeToday) return pick([`Schön, dass du wieder da bist${n}! Noch ${goal - xpToday} XP bis zum Tagesziel. 💪`, `Weiter geht's! Wir sind heute schon gut unterwegs. 🚀`]);
  if (streak >= 3) return `${streak} Tage am Stück${n}! Lass die Flamme heute nicht ausgehen. 🔥`;
  if (hour < 11) return pick([`Guten Morgen${n}! Ein Kaffee und eine kleine Übung? ☕`, `Guten Morgen${n}! Heute wartet Tag ${dayNum} auf uns. 🌞`]);
  if (hour >= 20) return pick([`Guten Abend${n}! Auch 15 Minuten zählen. 🌙`, `Noch eine kleine Runde vor dem Schlafen${n}? Ich bin dabei. 🌙`]);
  return pick([`Hallo${n}! Bereit für Tag ${dayNum}? Ich bin es! 😊`, `Hallo${n}! Noch ${daysLeft} Tage bis zur Prüfung – wir schaffen das zusammen. 💛`]);
}

/** Leerer Zustand mit Tarsi. */
export function emptyBox(text, mood = "sleep") {
  return h("div.empty", mascot(mood, 110), h("p", text));
}

/** Ladeanzeige mit nachdenklichem Tarsi. */
export function thinking(...lines) {
  return h("div.center.loading", mascot("think", 120, "wiggle"), ...lines);
}
