// External uptime check for MC Panel, run by GitHub Actions from outside the VPS.
// A problem must be seen twice in a row before an alert; recovery is reported too.
import { readFileSync, writeFileSync } from "node:fs";
import tls from "node:tls";

const CHECKS = [
  { key: "panel", label: "Панель", url: "https://panel.mc-panel.space/api/health", expect: (s, b) => s === 200 && b.includes('"ok":true') },
  { key: "site", label: "Сайт", url: "https://mc-panel.space/", expect: (s) => s === 200 },
  { key: "guide", label: "Инструкция", url: "https://mc-panel.space/guide/", expect: (s) => s === 200 },
];
const CERT_HOSTS = ["mc-panel.space", "panel.mc-panel.space"];
const CERT_MIN_DAYS = 10;

async function probe(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
      return { status: res.status, body: await res.text() };
    } catch (err) {
      if (i === 2) return { status: 0, body: "", error: err.cause?.code ?? err.name };
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
}

const certDays = (host) =>
  new Promise((resolve) => {
    const s = tls.connect({ host, port: 443, servername: host, timeout: 10_000 }, () => {
      const c = s.getPeerCertificate();
      s.end();
      resolve(Math.floor((Date.parse(c.valid_to) - Date.now()) / 86_400_000));
    });
    s.on("error", () => resolve(null));
    s.on("timeout", () => (s.destroy(), resolve(null)));
  });

const problems = {};
for (const c of CHECKS) {
  const r = await probe(c.url);
  if (!c.expect(r.status, r.body)) problems[c.key] = `${c.label} не открывается: ${r.status || r.error} (${c.url})`;
}
for (const h of CERT_HOSTS) {
  const d = await certDays(h);
  if (d !== null && d < CERT_MIN_DAYS) problems[`cert:${h}`] = `Сертификат ${h} истекает через ${d} дн.`;
}

const state = JSON.parse(readFileSync("state.json", "utf8"));
const lines = [];
for (const [k, text] of Object.entries(problems)) {
  state.seen[k] = (state.seen[k] ?? 0) + 1;
  if (state.seen[k] >= 2 && !state.alerted[k]) {
    state.alerted[k] = new Date().toISOString();
    lines.push(`🔴 ${text}`);
  }
}
for (const k of Object.keys(state.seen)) {
  if (problems[k]) continue;
  if (state.alerted[k]) lines.push(`🟢 Снова работает: ${k}`);
  delete state.seen[k];
  delete state.alerted[k];
}
writeFileSync("state.json", JSON.stringify(state, null, 1) + "\n");
console.log(Object.keys(problems).length ? `problems: ${Object.values(problems).join("; ")}` : "all ok");

if (lines.length) {
  const text = `Внешняя проверка (GitHub)\n${lines.join("\n")}${lines.some((l) => l.startsWith("🔴")) && Object.keys(problems).length === CHECKS.length ? "\n\nНе отвечает ничего: VPS выключен? Проверьте баланс Cloud.ru." : ""}`;
  const res = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: Number(process.env.CHAT_ID), text }),
  });
  if (!res.ok) throw new Error(`telegram ${res.status}`);
}
