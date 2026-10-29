# ⚡ SAQIB-MD QUICK SETUP GUIDE (BOT-HOSTING.NET & RAILWAY)

## Step 1: Extract Files
Upload `saqib_md_bot.zip` to your hosting panel (Bot-Hosting.net or Railway) and extract it.

## Step 2: Configure Your Credentials
1. Open the file `.env.example` in your File Manager.
2. Rename `.env.example` to `.env` (or create a new file named `.env`).
3. Fill in your real details in place of placeholders:
   - `MONGO_URI`="mongodb+srv://<your_username>:<your_password>@cluster0.mongodb.net/saqib_md?retryWrites=true&w=majority"
   - `GEMINI_API_KEY`="your_google_gemini_api_key_here"
   - `WEATHER_API_KEY`="your_openweathermap_api_key_here"
   - `OWNER_NUMBER`="923000000000" (your WhatsApp number with country code)

*(Keeping your real keys in `.env` ensures they remain private and are never leaked to public repositories).*

## Step 3: Start the Bot
Go to the **Console** tab on your host panel and click the **Start** button.
Open the live pairing link displayed in the console, enter your WhatsApp phone number, and link your account!
