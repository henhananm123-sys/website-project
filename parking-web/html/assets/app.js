"use strict";

/* ============================================================
 * לוח בקרה לשומר החניון — לוגיקת הפיד
 * כל הבקשות עוברות דרך הפרוקסי של Nginx באותו Origin
 * (/images/ לתמונות, /api/ למניפסט) — ולכן אין צורך ב-CORS.
 * ============================================================ */

const CONFIG = {
  manifestUrl: "/api/manifest.json", // רשימת התמונות משרת ה-Storage (באמצעות פרוקסי Nginx)
  imagesBase:  "/images/",           // בסיס כתובות התמונות (באמצעות פרוקסי Nginx)
  maxCards:    60,                   // מקסימום תמונות אחרונות להצגה במסך
};

const els = {
  conn:        document.getElementById("conn"),
  clock:       document.getElementById("clock"),
  grid:        document.getElementById("grid"),
  empty:       document.getElementById("empty"),
  alert:       document.getElementById("alert"),
  stats:       document.getElementById("stats"),
  auto:        document.getElementById("auto"),
  intervalSel: document.getElementById("interval"),
  refreshBtn:  document.getElementById("refresh"),
  lightbox:    document.getElementById("lightbox"),
  lightboxImg: document.getElementById("lightbox-img"),
  lightboxCap: document.getElementById("lightbox-cap"),
};

let items = [];   // התמונות המוצגות (החדש ראשון)
let timer = null; // מזהה הרענון האוטומטי

/* ---------- פונקציות עזר ---------- */

function tickClock() {
  els.clock.textContent = new Date().toLocaleTimeString("he-IL");
}

function setConn(state, text) {
  els.conn.className = `conn conn--${state}`; // ok | err | wait
  els.conn.textContent = text;
}

/** חותמת זמן תקנית למיון; 0 אם לא ניתן לחלץ */
function stampOf(item) {
  const t = Date.parse(item.ts || "");
  if (!Number.isNaN(t)) return t;
  // תמיכה בשמות קבצים במבנה *_YYYY-MM-DD_HH-MM-SS.*
  const m = item.file.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}`);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}

/** זמן לתצוגה: מהשדה ts, אחרת נגזר משם הקובץ, אחרת שם הקובץ עצמו */
function timeTextOf(item) {
  if (item.ts) {
    const d = new Date(item.ts);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "medium" });
    }
    return item.ts;
  }
  const m = item.file.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  return m ? `${m[1]} ${m[2]}:${m[3]}:${m[4]}` : item.file;
}

/** ניקוי ומיון המניפסט (החדש ראשון), עד maxCards */
function normalize(list) {
  return list
    .filter((i) => i && typeof i.file === "string" && i.file.trim() !== "")
    .sort((a, b) => stampOf(b) - stampOf(a))
    .slice(0, CONFIG.maxCards);
}

function showAlert(message) {
  els.alert.replaceChildren();
  const span = document.createElement("span");
  span.textContent = message;
  const retry = document.createElement("button");
  retry.className = "btn";
  retry.type = "button";
  retry.textContent = "נסה שוב";
  retry.addEventListener("click", () => {
    els.alert.hidden = true;
    load();
  });
  els.alert.append(span, retry);
  els.alert.hidden = false;
}

/* ---------- הצגה ---------- */

function buildCard(item) {
  const card = document.createElement("article");
  card.className = "card";
  card.title = item.file;

  const img = document.createElement("img");
  img.loading = "lazy";
  img.alt = `תמונת רכב — ${item.file}`;
  img.src = CONFIG.imagesBase + encodeURIComponent(item.file);
  img.addEventListener("click", () => openLightbox(item));
  img.addEventListener("error", () => {
    card.classList.add("card--broken");
    img.alt = "התמונה לא נטענה";
  });

  const meta = document.createElement("div");
  meta.className = "meta";

  if (item.plate) { // מידע מצוות ה-OCR (שדה אופציונלי במניפסט)
    const plate = document.createElement("span");
    plate.className = "plate";
    plate.textContent = item.plate; // textContent => חסין ל-XSS
    meta.append(plate);
  }

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = timeTextOf(item);
  meta.append(time);

  card.append(img, meta);
  return card;
}

/** עדכון הרשת בשמירה על כרטיסים קיימים (בלי להבהיב את התמונות) */
function render() {
  const existing = new Map(Array.from(els.grid.children, (c) => [c.dataset.file, c]));
  const frag = document.createDocumentFragment();

  for (const item of items) {
    let card = existing.get(item.file);
    if (card) existing.delete(item.file);
    else card = buildCard(item);
    card.dataset.file = item.file;
    frag.append(card);
  }

  els.grid.replaceChildren(frag);
  els.empty.hidden = items.length !== 0;
  els.stats.textContent =
    `${items.length} תמונות · עדכון אחרון: ${new Date().toLocaleTimeString("he-IL")}`;
}

/* ---------- רענון ---------- */

async function load() {
  els.refreshBtn.disabled = true;
  setConn("wait", "מביא עדכון…");
  try {
    const res = await fetch(CONFIG.manifestUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`שרת ה-Storage החזיר ${res.status}`);
    const data = await res.json();
    // נתמך: מערך ישיר, או אובייקט עם שדה items
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : null);
    if (!list) throw new Error("מבנה מניפסט לא נתמך (נדרש מערך תמונות)");
    items = normalize(list);
    render();
    els.alert.hidden = true;
    setConn("ok", items.length ? "מחובר · מקבל עדכונים" : "מחובר · אין תמונות עדיין");
  } catch (err) {
    setConn("err", "אין חיבור לשרת ה-Storage");
    showAlert(`שגיאה בעדכון הפיד: ${err.message}`);
  } finally {
    els.refreshBtn.disabled = false;
  }
}

/* ---------- תצוגה מוגדלת ---------- */

function openLightbox(item) {
  els.lightboxImg.src = CONFIG.imagesBase + encodeURIComponent(item.file);
  const parts = [];
  if (item.plate) parts.push(`רכב ${item.plate}`);
  parts.push(timeTextOf(item));
  els.lightboxCap.textContent = parts.join(" · ") || item.file;
  els.lightbox.hidden = false;
}
els.lightbox.addEventListener("click", () => {
  els.lightbox.hidden = true;
  els.lightboxImg.removeAttribute("src");
});

/* ---------- הפעלה ---------- */

function applyInterval() {
  if (timer) clearInterval(timer);
  timer = null;
  if (els.auto.checked) timer = setInterval(load, Number(els.intervalSel.value));
}

els.auto.addEventListener("change", applyInterval);
els.intervalSel.addEventListener("change", applyInterval);
els.refreshBtn.addEventListener("click", load);

tickClock();
setInterval(tickClock, 1000);
applyInterval();
load();
