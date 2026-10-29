# ⚡ SAQIB-MD (WhatsApp Multi-Device Bot & Pairing Portal)

Created for **Saqib Iqbal**  
High-performance WhatsApp automation bot built with `@whiskeysockets/baileys` and MongoDB session persistence.

---

## 🌟 Key Features
- **🌐 Web Pairing Portal:** QR scan ke baghair sirf phone number daal kar 8-digit code se WhatsApp link karein.
- **🛡️ Anti-Delete:** Kisi ka bhi delete kiya gaya message foran wapas recover karein (Same chat ya Inbox mode).
- **🔓 View-Once Saver:** 1-time view media ko permanently save karein (`.vv` aur `.vv2` inbox mode).
- **📥 Auto Status Saver:** Kisi ke status ko reply karein ya `.save` likhein, video/photo direct inbox mein aayegi.
- **👥 Smart Group Management:** `.tagall`, `.hidetag`, `.kick`, `.add`, `.promote`, `.antilink`, `.warn`.
- **🎭 21+ VIP Anime Reactions:** `.kiss`, `.love`, `.angry`, `.cuddle`, `.dance`, etc.
- **🛠️ 536 Active Commands:** Profile, Islamic, AI writing, Audio FX, Web tools, aur 281 self-explanatory aliases.

---

## 🚀 Deployment Guide (Persistent 24/7 Hosting)

### Option 1: Bot-Hosting.net (100% Free - No Credit Card Needed)
1. [Bot-Hosting.net](https://bot-hosting.net/) par login karein aur **"Create Server"** (Node.js) banayein.
2. **File Manager** mein `saqib_md_bot.zip` upload karein aur **Unarchive** (Extract) kar dein.
3. `.env.example` file ko rename karke **`.env`** karein aur apni details fill karein.
4. **Console** tab mein ja kar green **"Start"** button daba dein!
5. Console mein live pairing link show ho jayega.

### Option 2: Railway.app (Cloud Hosting)
1. Apne GitHub par ye files upload karein.
2. [Railway.app](https://railway.app/) par login karke **"New Project"** > **"Deploy from GitHub repo"** chunein.
3. **Variables** tab mein environment variables add karein:
   - `BOT_NAME` = `SAQIB-MD`
   - `OWNER_NAME` = `Saqib Iqbal`
   - `OWNER_NUMBER` = `923000000000` (apna WhatsApp number)
   - `MONGO_URI` = `mongodb+srv://...` (MongoDB Atlas link)
   - `WORK_TYPE` = `public`
4. Railway khud hi build karke live pairing URL de dega.

---

## 🧪 Automated Testing
Project ke tamam modules aur sanitizers ko test karne ke liye terminal par run karein:
```bash
npm test
```

---

## 📱 WhatsApp Kaise Link Karein (Pairing Steps)
1. Apni pairing site open karein.
2. Apna WhatsApp number country code ke sath darj karein (maslan: `923001234567`).
3. **"Generate 8-Digit Pairing Code"** button dabayein.
4. Mobile par official WhatsApp notification aayegi: *"Enter code on phone to link device"*.
5. WhatsApp open karein > **Linked Devices** > **Link with phone number instead** par 8-digit code darj karein.
6. WhatsApp connect hotay hi bot aapko confirmation message bhej dega!
