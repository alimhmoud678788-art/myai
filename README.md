# MyAI: مساعد ذكاء اصطناعي لسطح مكتب ويندوز

تطبيق دردشة ذكي يعمل على ويندوز، مبني بـ **Tauri v2 و React** للواجهة، و **Supabase** للخادم، و **Gemini** للذكاء الاصطناعي.

| الميزة | الحالة |
|---|---|
| مثبّت ويندوز (`setup.exe` و `.msi`) بأيقونة خاصة | ✅ |
| اختصار عام `Ctrl+Shift+Space` لفتح نافذة سريعة من أي برنامج (قابل للتغيير من الإعدادات) | ✅ |
| تحديث تلقائي في الخلفية، بملفات موقّعة عبر GitHub Releases | ✅ |
| تسجيل الدخول بجوجل (عبر المتصفح) وبرمز يصل إلى البريد الإلكتروني، مع حفظ الجلسة | ✅ |
| عرض الرد كلمة بكلمة، و Markdown، وتلوين الأكواد مع زر نسخ | ✅ |
| سجل محادثات: بحث، إعادة تسمية، حذف | ✅ |
| أسئلة على ملفات PDF (RAG مع pgvector، والاستخراج يتم على الجهاز) | ✅ |
| توليد الصور بالأمر `/image` أو `/صورة` مع زر حفظ على الجهاز | ✅ |
| بحث حي في الويب (Google Search Grounding) مع روابط المصادر | ✅ |
| الوضع الليلي والنهاري، والعربية (RTL) والإنجليزية (LTR) بتبديل فوري | ✅ |
| حد يومي للطلبات لكل مستخدم لحماية فاتورة Gemini | ✅ |

> 🔒 **الأمان:** التطبيق يحمل فقط `SUPABASE_URL` و `anon key`، وكلاهما عام بطبيعته وتحمي البيانات سياسات RLS.
> مفتاح `GEMINI_API_KEY` موجود فقط في Supabase Secrets، ولا يصل إلى جهاز المستخدم أبداً.

---

## هيكل المشروع

```
src/                     الواجهة (React) لنافذتين: main و quick
  components/chat/       Markdown, Composer, MessageList, Sources, ImageMessage
  components/layout/     Sidebar, SettingsDialog, UpdateBanner
  components/auth/       Login
  views/                 MainView, QuickChat
  hooks/                 useSession, useChat, useConversations
  lib/                   supabase, auth, api (SSE), pdf, files, prefs, updater
  i18n/                  ar.json, en.json
src-tauri/               Rust: الاختصار العام، أيقونة شريط المهام، الروابط العميقة، التحديث
supabase/migrations/     الجداول، RLS، البحث الدلالي، الحدود اليومية، تخزين الصور
supabase/functions/      chat (بث مباشر + RAG + بحث)، ingest (فهرسة PDF)، image
.github/workflows/       ci.yml للفحص، و release.yml لبناء المثبّت ونشره
```

---

## 1) المتطلبات على ويندوز

1. [Node.js 20+](https://nodejs.org)
2. [Rust](https://rustup.rs)
3. [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) مع خيار **Desktop development with C++**
4. WebView2، وهو مثبت مسبقاً في ويندوز 11

```powershell
npm install
```

## 2) إعداد Supabase

1. أنشئ مشروعاً مجانياً على [supabase.com](https://supabase.com).
2. اربط المشروع وطبّق قاعدة البيانات:

```powershell
npx supabase login
```
```powershell
npx supabase link --project-ref YOUR_PROJECT_REF
```
```powershell
npx supabase db push
```

3. خزّن مفتاح Gemini في الخادم فقط. احصل عليه من [Google AI Studio](https://aistudio.google.com/apikey):

```powershell
npx supabase secrets set GEMINI_API_KEY=your_key_here
```

إعدادات اختيارية: أسماء النماذج، والحدود اليومية لكل مستخدم:

```powershell
npx supabase secrets set GEMINI_CHAT_MODEL=gemini-2.5-flash CHAT_DAILY_LIMIT=200 IMAGE_DAILY_LIMIT=20 INGEST_DAILY_LIMIT=20
```

> أسماء نماذج Gemini تتغير مع الوقت. راجع القائمة الحالية في وثائق Gemini، وغيّرها هنا دون تعديل الكود.

4. انشر الدوال:

```powershell
npx supabase functions deploy chat
```
```powershell
npx supabase functions deploy ingest
```
```powershell
npx supabase functions deploy image
```

5. في لوحة تحكم Supabase:
   - **Authentication → URL Configuration → Redirect URLs:** أضف `myai://auth/callback`
   - **Authentication → Email Templates → Magic Link:** ضع `{{ .Token }}` في القالب، حتى يصل للمستخدم رمز من 6 أرقام بدلاً من رابط.
   - **Authentication → Providers → Google:** فعّله وأدخل Client ID و Secret.
     - أنشئهما من [Google Cloud Console](https://console.cloud.google.com/apis/credentials)، والنوع **Web application**.
     - Authorized redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

6. أنشئ ملف `.env` في جذر المشروع:

```powershell
copy .env.example .env
```

ثم ضع فيه `VITE_SUPABASE_URL` و `VITE_SUPABASE_ANON_KEY`، وتجدهما في **Project Settings → API**.

## 3) التشغيل أثناء التطوير

```powershell
npm run tauri dev
```

- اضغط **Ctrl+Shift+Space** من أي برنامج لفتح النافذة السريعة، و **Esc** لإخفائها.
- إغلاق النافذة الرئيسية يخفيها في شريط المهام، والخروج الفعلي من قائمة الأيقونة ← Quit.
- `Alt+Space` محجوز في ويندوز (قائمة النافذة) وفي PowerToys Run، لذلك لم يُستخدم كاختصار افتراضي. يمكنك تجربته من الإعدادات.

## 4) بناء ملف التثبيت

### أ) الأيقونة (مرة واحدة)
استبدل `app-icon.png` بشعارك (1024×1024)، ثم:
```powershell
npx tauri icon app-icon.png
```

### ب) مفاتيح توقيع التحديثات (مرة واحدة)
```powershell
npx tauri signer generate -w "$HOME\.tauri\myai.key"
```
- انسخ **المفتاح العام** الذي يظهر إلى `plugins.updater.pubkey` في ملف `src-tauri/tauri.conf.json`.
- غيّر `OWNER/REPO` في `plugins.updater.endpoints` إلى مستودعك على GitHub.
- ⚠️ **المفتاح الخاص** لا يُرفع إلى المستودع أبداً. إذا فقدته فلن تستطيع إرسال تحديثات للمستخدمين الحاليين.

### ج) البناء المحلي
```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$HOME\.tauri\myai.key" -Raw; npm run tauri build
```
الناتج:
- `src-tauri/target/release/bundle/nsis/MyAI_0.1.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/MyAI_0.1.0_x64_en-US.msi`

## 5) الإصدار والتحديث التلقائي عبر GitHub

1. ارفع المشروع إلى مستودع على GitHub، ويجب أن يكون **عاماً** حتى يعمل رابط `releases/latest`. للمستودعات الخاصة استضف `latest.json` في مكان عام، مثل Supabase Storage أو Cloudflare R2.
2. أضف هذه الأسرار في **Settings → Secrets and variables → Actions**:
   - `TAURI_SIGNING_PRIVATE_KEY`: محتوى ملف `myai.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. لكل إصدار جديد ارفع `version` في `src-tauri/tauri.conf.json` وفي `package.json`، ثم:

```powershell
git tag v0.2.0
```
```powershell
git push origin v0.2.0
```

يبني GitHub Actions المثبّت، وينشره مع ملف `latest.json`. التطبيقات المثبتة عند المستخدمين تفحص التحديثات عند التشغيل وكل 6 ساعات، وتحمّل التحديث في الخلفية، ثم تعرض شريط "تثبيت وإعادة تشغيل".

### توقيع الكود (لإزالة تحذير SmartScreen)
دون توقيع سيظهر للمستخدمين تحذير "Windows protected your PC". للإصدار العام استخدم **Azure Trusted Signing** أو شهادة OV/EV، واربطها عبر `bundle.windows.signCommand`. هذا التوقيع منفصل عن توقيع التحديثات.

---

## ملاحظات وقيود معروفة

- **ملفات PDF الممسوحة ضوئياً** لا تحتوي نصاً، فيظهر للمستخدم تنبيه. الحل لاحقاً: إرسال الملف إلى Gemini كـ `inlineData` لاستخراج النص (OCR).
- **بعض ملفات PDF العربية** قد تخرج نصوصها من pdf.js بترتيب حروف مضطرب. الحل نفسه: الاستخراج عبر Gemini.
- **شروط بحث جوجل:** يتطلب Google Search Grounding عرض `searchEntryPoint` (اقتراحات البحث) قبل الإطلاق العام. الدالة حالياً تعرض روابط المصادر فقط.
- **حفظ الجلسة:** الجلسة محفوظة في ملف `session.json` داخل AppData الخاص بالمستخدم. لأمان أعلى يمكن نقلها إلى Windows Credential Manager.
- **مدة تنفيذ الدوال:** الملفات الضخمة جداً قد تتجاوز حد التنفيذ في المستوى المجاني. الحد الحالي 2000 مقطع لكل ملف، أي حوالي 600 صفحة.

## الفحوصات

```powershell
npm run build
```
```powershell
cd src-tauri; cargo clippy -- -D warnings
```
```powershell
cd supabase/functions; deno check --config deno.json chat/index.ts ingest/index.ts image/index.ts
```
