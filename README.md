# SecureVault – Private credential manager (PWA)

HTML + Bootstrap 5 front end, Google Apps Script back end, Google Sheet as storage.
Installs on your phone like a normal app and works offline (read-only).

## How your data is protected

| Layer | What happens |
|---|---|
| **Master password** | One password opens the app and every card. It is never stored or sent anywhere. |
| **Encryption** | Each card is encrypted in your browser with AES-256-GCM (key derived with PBKDF2, 250,000 rounds) **before** it is uploaded. |
| **Google Sheet** | Contains only unreadable ciphertext. Even you can't read it in the sheet. This is intentional. |
| **Apps Script** | Only accepts requests that carry a secret token derived from your password. 5 wrong tries lock it for 10 minutes. |
| **Second prompt** | Tapping a card asks for the password again. After that all cards stay visible for 5 minutes, then hide on their own. |
| **Auto-lock** | The app locks after 5 minutes of inactivity or when you leave it for more than 1 minute. |

> ⚠ **There is no "forgot password".** Nobody, including you or Google, can decrypt the data without it.
> Pick a strong password you can remember and keep a copy somewhere safe (for example written on paper at home).

---

## Project structure

```
securevault-pwa/
├── index.html               ← App screen (lock screen, search, cards, modals)
├── manifest.webmanifest     ← PWA install info (name, colours, icons)
├── service-worker.js        ← Offline support + caching
├── css/
│   └── style.css            ← All custom styling (light + dark theme)
├── js/
│   ├── config.js            ← ★ PUT YOUR APPS SCRIPT URL HERE
│   ├── theme.js             ← Light/dark theme loader
│   ├── crypto.js            ← Encryption (Web Crypto API)
│   ├── api.js               ← Talks to Google Apps Script
│   └── app.js               ← App logic (unlock, search, cards, edit, sync)
├── icons/                   ← Logo + all PWA icon sizes (any + maskable + Apple)
├── vendor/                  ← Bootstrap, Bootstrap Icons, IBM Plex fonts (self-hosted)
└── backend/
    ├── Code.gs              ← ★ Paste into Google Apps Script
    └── appsscript.json      ← Optional manifest (timezone, web-app access)
```

Everything is bundled locally, so nothing loads from third-party CDNs. That is safer for a password app and is why it also works offline.

---

## Part 1 – Create the Google Sheet and backend (10 minutes)

1. Go to **https://sheets.google.com** and create a **Blank spreadsheet**. Name it `SecureVault Data`.
2. In the sheet menu choose **Extensions → Apps Script**. A new tab opens.
3. Delete the sample code in `Code.gs`.
4. Open `backend/Code.gs` from this project, copy **everything** and paste it into the editor. Press **Save** (💾). Name the project `SecureVault API`.
5. Click **Deploy → New deployment**.
   - Click the ⚙ gear next to *Select type* and choose **Web app**.
   - **Description:** `v1`
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
   - Click **Deploy**.
6. Google asks for permission. Click **Authorize access** → choose your account → if you see *"Google hasn't verified this app"* click **Advanced → Go to SecureVault API (unsafe) → Allow**. This warning is normal because you wrote the script yourself.
7. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/AKfy.../exec`.

> "Who has access: Anyone" is required so your phone can reach the script without a Google login.
> Your data stays safe because it is encrypted and the API needs your password-derived token.

## Part 2 – Connect the app to your script

Open `js/config.js` and replace the placeholder:

```js
API_URL: "https://script.google.com/macros/s/AKfy.../exec",
```

You can also change `REVEAL_TIMEOUT_MIN` and `AUTO_LOCK_MIN` there.
**Do not change `PBKDF2_ITERATIONS` after creating your vault.**

## Part 3 – Put the app online (HTTPS is required for PWAs)

Pick **one** option. All are free.

### Option A – Netlify (easiest, about 2 minutes)
1. Go to **https://app.netlify.com/drop** and sign in.
2. Drag the whole `securevault-pwa` folder onto the page.
3. Netlify gives you a link like `https://random-name.netlify.app`. You can rename it under *Site settings*.

### Option B – GitHub Pages
1. Create a **private or public** repo and upload all project files.
2. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
3. After a minute your app is at `https://YOUR-NAME.github.io/REPO-NAME/`.

### Option C – Cloudflare Pages
Create a Pages project → *Upload assets* → upload the folder.

### Test on your computer first (optional)
```bash
cd securevault-pwa
python -m http.server 8000
```
Open `http://localhost:8000`. `localhost` counts as secure, so everything works.

## Part 4 – First run

1. Open your app link. You will see **Create your vault**.
2. Choose your master password (12+ characters recommended) and confirm it. Do this yourself right after deploying, and do not share the link before you have.
3. Tap the orange **+** button to add your first card.

## Part 5 – Install it like an app

- **Android (Chrome):** menu **⋮ → Install app** (or tap *Install app on this device* on the lock screen).
- **iPhone (Safari):** **Share → Add to Home Screen**.
- **Desktop (Chrome/Edge):** install icon in the address bar.

## Part 6 – Using the app

| I want to… | Do this |
|---|---|
| Find a card | Type in the search bar. Matching cards show at the top and the rest hide. Search checks card titles, account names and field labels (and values while unlocked). |
| View credentials | Tap a card → enter your password → all cards unlock for 5 minutes. Tap the 👁 icon to show a value, or 📋 to copy it. |
| Edit | Open the card → ✏ edit. Change anything right inside the card → **Save card**. |
| Add a card | Orange **+** → enter the card title (for example `Google`). |
| Add several logins in one card | Inside the card tap **Add another account to this card**. Each one is a small sub-card (for example *Personal Gmail*, *Work Gmail*, *YouTube*). |
| Add extra fields | Tap **Add field** in a sub-card (for example *Recovery email*, *PIN*, *Security answer*). |
| Delete | Open the card → ✏ edit → **Delete**. |
| Sync after using another device | Tap the 🔄 button at the top. |
| Change master password | ⚙ Settings → *Change master password*. Everything is re-encrypted. |

### Example card

```
┌─ Google ──────────────────────────────────┐
│ ┃ Personal Gmail      ┃ Work Gmail         │
│ ┃ Email    ••••• 👁 📋 ┃ Email    ••••• 👁 📋 │
│ ┃ Password ••••• 👁 📋 ┃ Password ••••• 👁 📋 │
└───────────────────────────────────────────┘
```

---

## Updating the app later

**Front-end changes:** upload the changed files again, then open `service-worker.js` and change
`CACHE_VERSION` (for example `v1.0.1`) so phones pick up the new files.

**Backend changes:** in Apps Script choose **Deploy → Manage deployments → ✏ edit → Version: New version → Deploy**.
The URL stays the same. Saving the code alone does **not** update the live web app.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Open js/config.js and paste your URL" | You haven't replaced the placeholder, or the URL doesn't end with `/exec`. |
| "The server did not answer correctly" | Redeploy as Web app with **Who has access: Anyone**. Opening the URL in a browser should show `{"ok":true,"initialized":...}`. |
| "Too many wrong attempts" | Wait 10 minutes, or in Apps Script select the function `clearLockout` and press **Run**. |
| Wrong password, but I'm sure it's right | Make sure you didn't change `PBKDF2_ITERATIONS`, and that the sheet's `Vault` rows weren't edited by hand. |
| App doesn't show the newest version | Change `CACHE_VERSION` in `service-worker.js`, redeploy, then close and reopen the app. |
| Offline | You can still unlock and read cards from the encrypted copy on your phone. Editing needs internet. |
| Forgot master password | Data can't be recovered. To start over, run `DANGER_resetVault` in Apps Script. This wipes all cards. |

## Good habits

- Use a master password you have **never** used anywhere else.
- Turn on your phone's screen lock. The offline copy is encrypted, but a strong device lock is your first line of defence.
- Don't edit the `Vault` sheet by hand. Rows are encrypted and one wrong character makes a card unreadable.
- Share the Google Sheet with nobody. Even though it holds only ciphertext, there is no reason to expose it.
- Back up occasionally: **File → Make a copy** on the Google Sheet. Remember the copy still needs your password.

## Limits

- One card can hold roughly 45,000 characters when encrypted. That is hundreds of fields.
- If you use the app on two devices at the same time, the last save wins for that card. Tap 🔄 before editing.
