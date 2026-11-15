# MyAI: مساعد ذكاء اصطناعي خاص يعمل على جهازك

تطبيق دردشة ذكي لويندوز، **يعمل بالكامل على جهاز المستخدم**:
- بدون أي مفتاح API، وبدون حساب، وبدون سيرفر.
- بدون حدود استخدام، وبدون تكلفة على صاحب البرنامج.
- يعمل بدون إنترنت بعد أول تحميل، والمحادثات لا تغادر الجهاز.

## ⬇️ التحميل والتثبيت

1. ادخل على صفحة **Releases** في هذا المستودع، ونزّل الملف `MyAI_x.y.z_x64-setup.exe`.
2. شغّل الملف. إذا ظهرت رسالة **"Windows protected your PC"** اضغط **More info** ثم **Run anyway**.
3. عند أول تشغيل اختر "عقل البرنامج" واضغط **تحميل** (مرة واحدة فقط):
   - **القياسي:** 2.5 جيجا، أذكى، ويحتاج 8 جيجا رام.
   - **الخفيف:** 1.1 جيجا، أسرع، ويحتاج 4 جيجا رام.
   - إذا انقطع التحميل اضغط **استكمال التحميل** وسيكمل من حيث توقف.

**طريقة الاستخدام:**
- **Ctrl + Shift + Space** يفتح نافذة سريعة من أي برنامج، و **Esc** يخفيها.
- زر 📎 لإرفاق ملف PDF والسؤال عن محتواه، والبحث داخل الملف يتم على الجهاز.
- ⚙️ **الإعدادات:** الوضع الليلي، واللغة، والاختصار، وتغيير العقل، وحذف المحادثات.

## كيف يعمل
- **المحرك:** [llama.cpp](https://github.com/ggml-org/llama.cpp) (`llama-server.exe`) مضمَّن في المثبّت. البرنامج يشغّله على `127.0.0.1` بمنفذ عشوائي، ومفتاح عشوائي يتغير مع كل تشغيل، فلا يستطيع أي برنامج آخر استخدامه.
- **العقل:** نموذج Qwen3 بترخيص Apache-2.0 يسمح بالاستخدام التجاري. يُحمَّل من Hugging Face عند أول تشغيل إلى `%APPDATA%\com.myai.desktop\models`.
- **إغلاق المحرك:** يُربط المحرك بالبرنامج عبر Windows Job Object، فيُغلق تلقائياً عند إغلاق البرنامج أو تعطّله.
- **البيانات:** المحادثات والملفات محفوظة محلياً (IndexedDB).
- **سجل المحرك:** `%LOCALAPPDATA%\com.myai.desktop\logs\engine.log`.
- **تغيير الاسم والشعار:** من `src/lib/brand.ts`، و `productName` في `src-tauri/tauri.conf.json`، والأيقونة عبر `npx tauri icon`.

راجع [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) لتراخيص المكونات.

---

## للمطور

### هيكل المشروع
```
src/
  components/chat/       Markdown, Composer, MessageList, Sources, ImageMessage
  components/layout/     Sidebar, SettingsDialog, UpdateBanner
  components/setup/      ModelSetup (اختيار العقل وتحميله)
  views/                 MainView, QuickChat
  hooks/                 useChat, useEngine
  lib/                   engine (المحرك المحلي), db (IndexedDB/Dexie), pdf, rag (BM25), brand, prefs, updater
  i18n/                  ar.json, en.json
src-tauri/src/engine.rs  تحميل العقل (مع الاستكمال) وتشغيل llama-server وإيقافه
src-tauri/src/lib.rs     الاختصار العام، أيقونة شريط المهام، تغيير الاختصار
scripts/fetch-llama.ps1  تحميل llama.cpp لويندوز (يُستخدم في CI)
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
2. اعمل commit وارفعه، ثم انشره على فرع `release`:

```powershell
git push origin main
```
```powershell
git push origin main:release
```

يبني GitHub Actions المثبّت على ويندوز، وينشره في Releases مع ملف `latest.json`، فتصل التحديثات لكل المستخدمين تلقائياً.

**توقيع التحديثات:**
- مفتاح التوقيع محفوظ في المستودع **مشفّراً** في الملف `src-tauri/updater.key.encrypted`، بكلمة مرور عشوائية طولها 192 بت.
- السر الوحيد المطلوب هو كلمة المرور. أضفها في **Settings → Secrets and variables → Actions** باسم `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- إذا لم تُضف كلمة المرور، يُبنى المثبّت عادياً، لكن ذلك الإصدار لا يُوزَّع كتحديث تلقائي.

### الفحوصات
```powershell
npm run build
```
```powershell
cd src-tauri; cargo clippy -- -D warnings
```

### قيود معروفة
- **ملفات PDF الممسوحة ضوئياً** لا تحتوي نصاً، فيظهر للمستخدم تنبيه.
- **السرعة:** المحرك يعمل حالياً على المعالج (CPU)، وسرعته تعتمد على الجهاز. دعم كارت الشاشة (Vulkan) مخطط لاحقاً.
- **توليد الصور والبحث في الإنترنت:** غير متاحين في النسخة المحلية حالياً.
- **SmartScreen:** لإزالة تحذيره نهائياً يلزم توقيع الكود بشهادة، مثل Azure Trusted Signing.
