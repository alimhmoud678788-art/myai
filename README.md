# MyAI: مساعد ذكاء اصطناعي لسطح مكتب ويندوز

تطبيق دردشة ذكي يعمل على ويندوز، مبني بـ **Tauri v2 و React**، ويتصل بـ **Google Gemini** مباشرة.
**لا يوجد خادم وسيط ولا حسابات.** كل مستخدم يضع مفتاح Gemini المجاني الخاص به عند أول تشغيل، وكل بياناته تبقى على جهازه.

## ⬇️ التحميل والتثبيت (للمستخدمين)

1. ادخل على صفحة **Releases** في هذا المستودع، ونزّل الملف `MyAI_x.y.z_x64-setup.exe`.
2. شغّل الملف. إذا ظهرت رسالة **"Windows protected your PC"** اضغط **More info** ثم **Run anyway**. هذه الرسالة تظهر لأن البرنامج جديد وغير موقّع بشهادة مدفوعة.
3. عند أول تشغيل:
   - افتح https://aistudio.google.com/apikey وسجّل الدخول بحساب جوجل.
   - اضغط **Create API key** وانسخ المفتاح.
   - الصقه في البرنامج واضغط **ابدأ**.

**طريقة الاستخدام:**
- **Ctrl + Shift + Space** يفتح نافذة سريعة من أي برنامج، و **Esc** يخفيها.
- اكتب `/صورة` متبوعة بالوصف لتوليد صورة، مثلاً: `/صورة قطة تقرأ كتاباً`.
- زر 📎 لإرفاق ملف PDF والسؤال عن محتواه.
- خيار 🌐 لتفعيل البحث في الويب مع روابط المصادر.
- ⚙️ **الإعدادات:** الوضع الليلي، واللغة، وتغيير الاختصار، وتغيير المفتاح، وحذف كل البيانات.
- إغلاق النافذة يخفيها بجانب الساعة، والخروج الفعلي من قائمة الأيقونة ← **Quit**.
- التحديثات تُحمَّل تلقائياً، ويظهر شريط أزرق "تثبيت وإعادة تشغيل".

## الميزات

| الميزة | التفاصيل |
|---|---|
| مثبّت ويندوز | `setup.exe` (NSIS) و `.msi`، ويثبَّت للمستخدم الحالي دون صلاحيات مدير |
| اختصار عام | نافذة سريعة تظهر فوق كل البرامج، والاختصار قابل للتغيير |
| تحديث تلقائي | ملفات موقّعة (Ed25519) تُنشر عبر GitHub Releases |
| عرض الردود | كلمة بكلمة، مع Markdown وتلوين الأكواد وزر نسخ |
| سجل المحادثات | محفوظ على الجهاز، مع بحث وإعادة تسمية وحذف |
| أسئلة على PDF | استخراج النص وفهرسته على الجهاز، ثم البحث بالمعنى (Embeddings) |
| توليد الصور | زر حفظ يفتح نافذة الحفظ الأصلية في ويندوز |
| البحث في الويب | عبر Google Search Grounding، مع روابط المصادر |
| الواجهة | العربية (RTL) والإنجليزية (LTR)، والوضع الليلي والنهاري وحسب النظام |
| اختيار النموذج | البرنامج يختار أفضل نماذج Gemini المتاحة لمفتاحك تلقائياً، فلا يتأثر بتغيّر أسماء النماذج |

## 🔒 الخصوصية والأمان

- **المفتاح:** لا يوجد أي مفتاح مدمج داخل البرنامج. مفتاح المستخدم يُحفظ في **Windows Credential Manager** (مشفّر بحساب ويندوز)، ولا يُرسل إلا إلى `generativelanguage.googleapis.com`.
- **البيانات:** المحادثات والصور وملفات PDF المفهرسة محفوظة محلياً في `%LOCALAPPDATA%\com.myai.desktop`.
- **الحماية:** سياسة CSP صارمة تمنع الاتصال بأي جهة أخرى، و Markdown يُعرض دون HTML خام، والكتابة على القرص محصورة في المسار الذي يختاره المستخدم.

---

## للمطور

### هيكل المشروع
```
src/
  components/chat/       Markdown, Composer, MessageList, Sources, ImageMessage
  components/layout/     Sidebar, SettingsDialog, UpdateBanner
  components/setup/      KeySetup (شاشة أول تشغيل)
  views/                 MainView, QuickChat
  hooks/                 useChat, useApiKey
  lib/                   gemini (API + اختيار النماذج), db (IndexedDB/Dexie), pdf, rag, files, prefs, updater
  i18n/                  ar.json, en.json
src-tauri/src/lib.rs     الاختصار العام، أيقونة شريط المهام، خزنة المفاتيح، تغيير الاختصار
.github/workflows/       ci.yml للفحص، و release.yml لبناء المثبّت ونشره
```

### التشغيل محلياً على ويندوز
المتطلبات:
1. [Node.js 20+](https://nodejs.org)
2. [Rust](https://rustup.rs)
3. [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) مع خيار **Desktop development with C++**

```powershell
npm install
```
```powershell
npm run tauri dev
```

### إصدار نسخة جديدة
1. ارفع رقم `version` في `src-tauri/tauri.conf.json` وفي `package.json`.
2. نفّذ:

```powershell
git tag v0.2.0
```
```powershell
git push origin v0.2.0
```

يبني GitHub Actions المثبّت على ويندوز، وينشره في Releases مع ملف `latest.json`، فتصل التحديثات لكل المستخدمين تلقائياً.

يحتاج ذلك سرّين في **Settings → Secrets and variables → Actions**:
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

ويجب أن يطابقا المفتاح العام `pubkey` الموجود في `tauri.conf.json`.

### الفحوصات
```powershell
npm run build
```
```powershell
cd src-tauri; cargo clippy -- -D warnings
```

### قيود معروفة
- **ملفات PDF الممسوحة ضوئياً** لا تحتوي نصاً، فيظهر للمستخدم تنبيه.
- **توليد الصور** قد يحتاج تفعيل الدفع (Billing) في حساب Google AI Studio حسب سياسة جوجل الحالية. البرنامج يعرض رسالة واضحة إذا لم يكن متاحاً.
- **الحد المجاني من جوجل** محدود بعدد طلبات في الدقيقة واليوم، والبرنامج يعرض رسالة واضحة عند تجاوزه.
- **SmartScreen:** لإزالة تحذيره نهائياً يلزم توقيع الكود بشهادة، مثل Azure Trusted Signing.
