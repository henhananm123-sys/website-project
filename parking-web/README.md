# דשבורד שומר החניון — שירות Web (Nginx)

שירות ה-Web של מערכת ניטור החניון: מציג לשומר לוח בקרה (Dashboard) עם פיד תמונות הרכב, ומחבר אותו לשרת ה-Storage דרך Reverse Proxy — הכל מ-Origin אחד, ללא צורך ב-CORS.

**יכולות הדשבורד:** עברית RTL · רענון אוטומטי (3/5/10/30 שניות) עם אפשרות כיבוי · חיווי מצב חיבור בזמן אמת · מיון "החדש ראשון" לפי חותמת זמן · תגית מספר רישוי (אופציונלי, מהמניפסט) · הגדלת תמונה בלחיצה · עיצוב ללא CDN — עובד גם ברשת סגורה ללא אינטרנט.

## מבנה התיקייה

```
parking-web/
├── Dockerfile                              # משימה 1: אריזת Nginx + קובצי הדשבורד
├── docker-compose.yml                      # הרצה מקומית לבדיקה (כולל Storage מדומה)
├── nginx/templates/default.conf.template   # משימה 3: קונפיג Nginx — Reverse Proxy
├── html/                                   # משימה 2: הדשבורד
│   ├── index.html
│   └── assets/ (style.css, app.js, favicon.svg)
├── mock-storage/                           # Storage מדומה לבדיקות בלבד
│   ├── nginx.conf
│   ├── manifest.json
│   └── images/ (3 תמונות לדוגמה)
├── tools/                                  # כלי עזר לצוות 3: יצירת manifest מתיקיית מצלמה
│   ├── gen-manifest.ps1
│   └── gen-manifest.py
└── HANDOFF-TEAM3.md                        # דוח מסירה לאיש צוות 3 (DevOps)
```

## נתיבים שהשירות מספק

| נתיב | מה מוחזר | מקור |
|---|---|---|
| `/` | דף הדשבורד (HTML/CSS/JS) | קובצים סטטיים בתוך הקונטיינר |
| `/healthz` | `ok` — בדיקת תקינות | Nginx |
| `/images/<קובץ>` | תמונת רכב | **Reverse Proxy ⟶ שרת Storage** |
| `/api/manifest.json` | רשימת התמונות העדכנית (JSON) | **Reverse Proxy ⟶ שרת Storage** |

## חוזה הממשק מול שרת ה-Storage (לידיעת הצוות השני)

ברירת המחדל היא `http://storage:9000`, והיא נשלטת במלואה על-ידי משתני סביבה:

| משתנה | ברירת מחדל | תיאור |
|---|---|---|
| `STORAGE_HOST` | `storage` | שם ה-Service ברשת Docker (או שם מחשב/IP) |
| `STORAGE_PORT` | `9000` | הפורט שבו מאזין שרת ה-Storage |
| `STORAGE_SCHEME` | `http` | `http` או `https` |

השרת נדרש להחזיר שתי קריאות GET:

1. **`GET /api/manifest.json`** — מערך JSON (או אובייקט עם שדה `items`) עם התמונות האחרונות:

```json
[
  {
    "file": "car_2026-11-10_08-15-01.jpg",
    "plate": "אב-123-45",
    "ts": "2026-11-10T08:15:01"
  }
]
```

- `file` — **חובה**: שם הקובץ יחסית לנתיב `/images/`
- `plate` — אופציונלי: מספר רישוי (פלט של צוות ה-OCR)
- `ts` — אופציונלי: תאריך/שעה בפורמט ISO 8601. אם חסר, הדשבורד ינסה לחלץ זמן משם הקובץ במבנה `*_YYYY-MM-DD_HH-MM-SS.*`

2. **`GET /images/<קובץ>`** — קובץ התמונה (jpg/jpeg/png/webp/svg) עם כותרת `Content-Type` מתאימה.

הערות:
- **לא נדרש CORS** — הדשבורד פונה ל-/images/ ול-/api/ באותו ה-Origin דרך הפרוקסי.
- הפרוקסי מאפשר **GET בלבד** בשני הנתיבים (שיטות אחרות נדחות ב-403).
- תמונות מוחזרות לדפדפן עם מטמון של שעה; המניפסט ללא מטמון.

## הרצה מקומית (לבדיקה מהירה)

```bash
docker compose up --build -d
```

- דשבורד: **http://localhost:8080**
- ה-Storage המדומה ישירות (לניפוי): http://localhost:9001/api/manifest.json

בדיקות מהירות בשורת פקודה:

```bash
curl http://localhost:8080/healthz
curl -I http://localhost:8080/images/car-0002_2026-11-10_08-02-31.svg
curl http://localhost:8080/api/manifest.json
```

## שילוב ב-compose המאוחד של הצוות

ב-compose המשותף דרוש רק שירות `web` (ה-`storage` שכאן הוא מדומה לבדיקות):

```yaml
  web:
    build: ./parking-web        # נתיב תיקיית השירות במאגר המשותף
    ports:
      - "8080:80"
    environment:
      STORAGE_SCHEME: http
      STORAGE_HOST: storage     # לפי שם השירות של צוות ה-Storage
      STORAGE_PORT: "9000"
    depends_on:
      - storage
    restart: unless-stopped
```

## איך הקונפיגורציה עובדת

- התבנית `nginx/templates/default.conf.template` נהפכת בעליית הקונטיינר ל-`/etc/nginx/conf.d/default.conf` (מנגנון ה-templates הרשמי של התמונה `nginx:1.27-alpine`), ומשתני הסביבה `STORAGE_*` מוזרקים לתוכה.
- `proxy_pass` מבוסס-משתנה עם `resolver 127.0.0.11` (Docker DNS) — פתרון שם דינמי בזמן ריצה, ששורד יצירה מחדש של קונטיינר ה-Storage בלי להריץ מחדש את ה-Web.
- `HEALTHCHECK` ב-Dockerfile מאותת על `/healthz` — אינדיקציית `healthy` עבור Docker/Orchestrator.

## שינויים עתידיים

- כל קובץ מוצר (HTML/CSS/JS, תבנית Nginx) נארז לתוך התמונה ב-build — אחרי כל שינוי להריץ `docker compose up --build -d`.
- כדי להצביע לשרת Storage אחר מספיק לשנות את `STORAGE_HOST`/`STORAGE_PORT`/`STORAGE_SCHEME` — בלי לגעת בקוד.

## הערה על עיצוב

לא נעשה שימוש ב-Tailwind/Bootstrap מ-CDN כדי שהדשבורד יעבוד בעמדת השומר גם בלי אינטרנט. אם תרצו לעבור ל-Tailwind — מספיק להחליף את `html/assets/style.css` בגרסה מקומית של הפריימוורק.
