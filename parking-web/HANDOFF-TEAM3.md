# דוח מסירה (Handoff) לאיש צוות 3 — DevOps, אינטגרציה ו-Docker Compose

נכתב על-ידי איש צוות 1 (תשתית Web ו-Nginx).
כל מה שאתה צריך כדי לחבר את שרת ה-Web שלי מול ה-Apache שלך, הרשתות, ה-Volume של מצלמת ה-IoT ובדיקות קצה-לקצה.

---

## 1. מה נמסר לך בחבילה

```
parking-web/
├── Dockerfile                              # תמונת שרת ה-Web (nginx:1.27-alpine) — מוכן, אין לשנות
├── nginx/templates/default.conf.template   # קונפיג ה-Reverse Proxy — מוכן, אין לשנות
├── html/                                   # הדשבורד (RTL, רענון אוטומטי, lightbox)
├── docker-compose.yml                      # ⚠ רק לבדיקה מקומית שלי — אל תשלב אותו ב-compose המרכזי
├── mock-storage/                           # Storage מדומה לבדיקות בלבד (nginx סטטי)
├── tools/gen-manifest.ps1                  # סקריפט עזר: יוצר manifest.json מתוך תיקיית תמונות
├── tools/gen-manifest.py                   # אותו דבר ב-Python (לבחירתך)
├── README.md                               # תיעוד מלא של השירות
└── HANDOFF-TEAM3.md                        # הקובץ הזה
```

**מה נשאר לך לבנות:** ה-compose המרכזי (nginx + apache), הרשת הפנימית, ה-bind mount לתיקיית המצלמה, והרצת הבדיקות.

---

## 2. חוזה הממשק (מה שה-Apache שלך חייב לספק)

שרת ה-Web שלי מנתב את שני הנתיבים הבאים ישירות אל שרת ה-Storage (לפי `STORAGE_HOST`/`STORAGE_PORT`):

| קריאה מהדפדפן | נופלת על ה-Apache שלך כ- | צריך להחזיר |
|---|---|---|
| `GET /api/manifest.json` | `GET /api/manifest.json` (אותו נתיב) | מערך JSON של תמונות |
| `GET /images/<קובץ>` | `GET /images/<קובץ>` (אותו נתיב) | קובץ התמונה + `Content-Type` תקין |

פורמט המניפסט (מהחדש לישן, או תן לי חותמת זמן ואני אמיין):

```json
[
  {
    "file": "car_2026-11-16_10-15-01.jpg",
    "plate": "אב-123-45",
    "ts": "2026-11-16T10:15:01"
  }
]
```

- `file` — **חובה**, שם הקובץ יחסית ל-`/images/`
- `plate` — אופציונלי (מגיע מצוות ה-OCR בעתיד)
- `ts` — אופציונלי, ISO 8601. אם חסר, הדשבורד מחלץ זמן משם הקובץ במבנה `*_YYYY-MM-DD_HH-MM-SS.*`
- **אין צורך ב-CORS** — הכול עובר דרך הפרוקסי באותו Origin
- הפרוקסי מאפשר **GET בלבד** בשני הנתיבים (שאר השיטות נדחות ב-403)
- הנתיבים ב-Apache חייבים להיות **בדיוק** `/images/` ו-`/api/` (אל תשנה נתיבים ב-Apache; אם חייבים — השתמשו ב-Alias ב-Apache, לא אצלי)

---

## 3. שילוב שירות ה-Web ב-compose המרכזי שלך

```yaml
services:
  web:
    build: ./parking-web          # תיקיית השירות שלי במאגר המשותף
    ports:
      - "8080:80"                 # דפדפן השומר
    environment:
      STORAGE_SCHEME: http
      STORAGE_HOST: storage       # ⬅ שנה לשם שתבחר לשירות ה-Apache (למשל: apache)
      STORAGE_PORT: "80"          # ⬅ הפורט שה-Apache מאזין לו בפנים (80 ברירת מחדל של httpd)
    networks:
      - parking-net
    depends_on:
      - storage                   # או שם שירות ה-Apache שלך
    restart: unless-stopped

  # ── דוגמה מקבילה אצלך (רק להמחשה — ה-Apache שלך מחליף את זה) ──
  storage:                        # השם הזה נדרש ב-STORAGE_HOST אם לא שינית
    image: httpd:2.4-alpine
    networks:
      - parking-net
    volumes:
      - ./camera-drop/images:/usr/local/apache2/htdocs/images:ro
      - ./camera-drop/images/manifest.json:/usr/local/apache2/htdocs/api/manifest.json:ro

networks:
  parking-net:
    driver: bridge
```

**חשוב:**
- ברירת המחדל ב-Dockerfile שלי היא `STORAGE_PORT=9000` — אבל ב-compose המרכזי **חובה להציב** את הפורט האמיתי של ה-Apache (בדרך-כלל `80`). הכתובת המלאה נשלטת 100% דרך המשתנים, בלי לגעת בקוד.
- אם תעדיף שה-Apache יאזין ב-9000 (להתאים לברירת המחדל שלי) — גם תקין, אבל אז חובה `Listen 9000` בקונפיג של ה-Apache.
- `resolver 127.0.0.11` כבר בנוי אצלי: אם תבנה מחדש את קונטיינר ה-Apache, שרת ה-Web לא צריך לעלות מחדש (פתרון DNS דינמי).

### המניפסט ב-bind mount של קובץ בודד
`/usr/local/apache2/htdocs/api` לא קיים בתמונת httpd — Docker ייצור אותה אוטומטית בעת ה-mount, וזה עובד. אם אתה מעדיף להימנע מ-mount של קובץ בודד, החלופה היא **Alias ב-Apache**:

```apache
Alias /api/manifest.json /usr/local/apache2/htdocs/images/manifest.json
```

ואז פשוט מייצרים את המניפסט בתוך תיקיית התמונות עצמה (ראה סעיף 4).

---

## 4. סימולציית מצלמת ה-IoT — התיקייה המקומית והמניפסט

המצלמה "זורקת" תמונות לתיקייה מקומית (למשל `camera-drop/images`), התיקייה נכנסת ל-Apache כ-bind mount, והדשבורד מציג אותן. כדי שהדשבורד ידע מה יש — צריך גם `manifest.json` עדכני. **נתתי לך סקריפטים מוכנים:**

PowerShell (על מחשב ה-Windows שמדמה את המצלמה):

```powershell
powershell -ExecutionPolicy Bypass -File tools\gen-manifest.ps1 -ImagesDir "C:\...\camera-drop\images"
```

Python:

```bash
python tools/gen-manifest.py "C:\...\camera-drop\images"
```

הסקריפטים סורקים את קובצי התמונות (jpg/jpeg/png/webp/svg/bmp), שולפים זמן משם הקובץ (`*_YYYY-MM-DD_HH-MM-SS` או `*_YYYYMMDD_HHMMSS`) או מתאריך שינוי הקובץ, ממיינים מהחדש לישן וכותבים `manifest.json` (UTF-8 ללא BOM).

**המלצת תזמון:** הרצה מתוזמנת כל 30–60 שניות (Task Scheduler ב-Windows או cron), כך שתמונה חדשה שהמצלמה "השליכה" מופיעה בדשבורד תוך עד ~דקה + מרווח הרענון שנבחר בדשבורד (ברירת מחדל 5 שניות).

---

## 5. צ'ק-ליסט בדיקות אינטגרציה (קצה לקצה)

```bash
docker compose up -d --build          # העלאת הכול בפקודה אחת
docker compose ps                     # web צריך להיות Up (healthy)

# 1) תקינות שרת ה-Web
curl http://localhost:8080/healthz    # צפוי: ok

# 2) הפרוקסי למניפסט (ה-Apache מחזיר JSON)
curl http://localhost:8080/api/manifest.json   # צפוי: 200 + JSON

# 3) הפרוקסי לתמונות
curl -I http://localhost:8080/images/<שם-קובץ-מהמניפסט>   # צפוי: 200 + Content-Type: image/*

# 4) דפדפן
# http://localhost:8080 — התמונות מוצגות, חיווי "מחובר · מקבל עדכונים"

# 5) זרימת מצלמה
# העתק תמונה חדשה ל-camera-drop/images (עם זמן בשם: car_2026-11-16_10-15-01.jpg)
# הרץ gen-manifest → לחץ "רענן כעת" בדשבורד → הכרטיס החדש ראשון

# 6) בדיקת כשל והתאוששות
docker compose stop storage    # (או שם ה-Apache)
# בדשבורד: חיווי "אין חיבור לשרת ה-Storage" + התראה עם "נסה שוב"
docker compose start storage
# לחיצה על "נסה שוב" (או רענון אוטומטי) → חוזר לעבודה בלי להריץ את ה-Web מחדש
```

קריטריון הצלחה: כל 6 הסעיפים עוברים, וכן `docker compose up -d` בודד מרים את הכול מאפס.

---

## 6. הערות גמר

- אל תשנה ב-Dockerfile / בתבנית הקונפיג / בקוד הדשבורד — הכתובת היחידה שנדרשת היא דרך `STORAGE_*` ב-compose שלך.
- שינוי ב-HTML/CSS/JS דורש `docker compose build web` (הקבצים נארזים לתמונה).
- ה-`docker-compose.yml` וה-`mock-storage/` שבחבילה — רק לבדיקות עצמאיות שלי; אין לשלבם ב-compose המרכזי.
- פורט ה-Web למחשב השומר: `8080:80` (אפשר להחליף ב-`80:80` אם תרצו פורט רגיל).
