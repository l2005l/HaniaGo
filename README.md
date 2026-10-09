# HaniaGo

תכנון וליווי של טיול משפחתי: משפחה ויעד, טיסה, יציאה מהבית, מסלול יומי, תקציב, שיתוף וקהילה.

- `public/index.html` האפליקציה, עמוד אחד בלי שלב בנייה.
- `src/worker.js` השרת: Cloudflare Worker עם מסד D1.
- `migrations/` מבנה המסד.
- `tests/` בדיקות השרת. הרצה: `npm test` (Node 22).

## פריסה

כל דחיפה ל-`main` מריצה בדיקות ואז פורסת ל-Cloudflare. הפריסה יוצרת את מסד הנתונים `haniago` אם הוא לא קיים.

צריך להגדיר פעם אחת ב-GitHub, תחת Settings, Secrets and variables, Actions:

| סוד | מאיפה |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare, My Profile, API Tokens. הרשאות עריכה ל-Workers Scripts, ל-D1 ול-Workers AI |
| `CLOUDFLARE_ACCOUNT_ID` | מופיע בעמוד Workers בחשבון |

אחרי הפריסה הראשונה מוסיפים דומיין ב-Cloudflare: ה-Worker `haniago`, Settings, Domains and Routes.

## מקורות מידע

כל מקור הוא רשות. בלי המפתח שלו נקודת הקצה עונה `available: false`, והאפליקציה חוזרת להערכה או לקישור חיצוני. מגדירים ב-Cloudflare, ב-Worker, תחת Settings, Variables and Secrets, כסוד.

| סוד | מה הוא מפעיל | בלעדיו |
| --- | --- | --- |
| `ADMIN_KEY` | כניסת עורך בלשונית קהילה: תור אישור, לחיצות ושימוש | אין כניסת עורך |
| `TRAVELPAYOUTS_TOKEN` | רשימת טיסות עם מחירים מהיומיים האחרונים | רק קישור ל-Skyscanner |
| `GOOGLE_KEY` | זמן נסיעה לנתב"ג עם פקקים (Routes API) | הזנה ידנית של הזמן מ-Waze |

`GOOGLE_MONTHLY_CAP` ב-`wrangler.jsonc` עוצר את הפניות ל-Google ב-4,500 בחודש, מתחת למכסה החינמית. `AI_DAILY_CAP` מגביל את הפניות למודל ל-300 ביום.

עוד לא מחובר: לוח הזמנים של הרכבת. הטבלה `rail` ונקודת הקצה `/api/train` קיימות, וחסר הייבוא של הנתונים.

## בדיקת מצב

`/api/health` מחזיר אילו מקורות מחוברים.
