# =============================================================================
# שירות ה-Web (Nginx) — לוח הבקרה של שומר החניון
# בסיס: התמונה הרשמית nginx:1.27-alpine
# =============================================================================

FROM nginx:1.27-alpine

# ברירות מחדל לחיבור אל שרת ה-Storage — אפשר לדרוס ב-docker-compose.
# המשתנים מוזרקים לקונפיג בעליית הקונטיינר (מנגנון templates/envsubst).
ENV STORAGE_SCHEME=http \
    STORAGE_HOST=storage \
    STORAGE_PORT=9000

# קובצי הדשבורד (HTML/CSS/JS) — מוצגים מ-/ של השרת
COPY html/ /usr/share/nginx/html/

# תבנית הקונפיג: הופכת ל-/etc/nginx/conf.d/default.conf בעליית הקונטיינר,
# לאחר הצבת משתני הסביבה (STORAGE_*) — מנגנון ה-templates של התמונה הרשמית
COPY nginx/templates/ /etc/nginx/templates/

EXPOSE 80

# בדיקת תקינות ל-Orchestrator / Docker
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/healthz || exit 1
