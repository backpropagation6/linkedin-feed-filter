# 🛡️ LinkedIn Feed Keyword Filter

> Clean your LinkedIn feed from noise, buzzwords, and repetitive topics. A lightweight, privacy-first browser extension (Manifest V3) that automatically filters and hides posts based on your custom keywords.

<p align="center">
  <img src="assets/demo.gif" alt="LinkedIn Feed Filter in action" width="720" style="border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
</p>

<p align="center">
  <a href="#why"><img src="https://img.shields.io/badge/Privacy-Local%20only-success?style=flat-square" alt="Privacy"></a>
  <a href="#-installation"><img src="https://img.shields.io/badge/Chrome-Manifest%20V3-blue?style=flat-square" alt="Chrome MV3"></a>
  <a href="#-installation"><img src="https://img.shields.io/badge/Firefox-MV3%20142%2B-orange?style=flat-square" alt="Firefox MV3"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License"></a>
  <a href="#"><img src="https://img.shields.io/badge/Dependencies-0-lightgrey?style=flat-square" alt="Zero Dependencies"></a>
</p>

---

## 🎯 Why This Extension?

Your LinkedIn feed is often flooded with content you simply don't want to see:
- Repetitive buzzwords and viral engagement-bait
- Topics you aren't interested in (e.g. crypto, politics, hiring blitzes)
- Self-promotion disguised as advice

**LinkedIn Feed Filter** gives you full control back over what appears on your timeline. Add any keyword or phrase, and matching posts are removed from the feed.

---

## ✨ Features

- **⚡ Real-time Filtering**: Posts containing your keywords disappear automatically as you scroll down your feed.
- **🔄 Instant Sync**: Change keywords in the popup, and every open LinkedIn tab updates instantly without refreshing.
- **👀 Two Display Modes**:
  - **Hide Completely (*Default*)**: Seamless feed. Posts are completely removed (`display: none`), with no gaps or blank spots.
  - **Collapse with Notice**: Collapses the post into a subtle banner showing which keyword matched, plus a **Show** button if you want to inspect it.
- **🔍 Smart Matching**:
  - Whole-word, case-insensitive matching (so blocking `pro` won't block `programmer`), accented letters included.
  - Handles hashtags (e.g. `#crypto`, `#hiring`).
  - Handles multi-word phrases (e.g. `growth hacking`, `open for work`).
  - Looks at the whole post card, author name included.
- **🚀 Lightweight**: New posts are checked the moment they are added to the page, before they are painted. Results are cached per post, so periodic re-checks stay cheap.
- **🩺 Self-check**: The popup shows how many posts are on the page and how many are hidden. If LinkedIn changes its page structure and no post is recognised, the popup says so instead of failing silently.
- **🔒 Private & Open Source**: No remote servers, no analytics, no tracking. Runs entirely inside your browser using the native storage API. See [PRIVACY.md](PRIVACY.md).

---

## 🛠️ Installation

### 🟦 Google Chrome / Brave / Edge (Chromium-based)

1. **Clone or Download** this repository:
   ```bash
   git clone https://github.com/backpropagation6/linkedin-feed-filter.git
   ```
   *(Or click **Code > Download ZIP** on GitHub and unzip it)*.

2. Open your browser and navigate to:
   ```text
   chrome://extensions/
   ```

3. Toggle **Developer mode** on (top-right corner).

4. Click **Load unpacked** (top-left button).

5. Select the `linkedin-feed-filter` folder.

6. **Done.** Pin the icon to your toolbar for quick access.

---

### 🦊 Firefox (142+)

Firefox supports Manifest V3 natively. No separate build or branch needed: the same extension works as-is on both Chrome and Firefox.

1. **Clone or Download** this repository:
   ```bash
   git clone https://github.com/backpropagation6/linkedin-feed-filter.git
   ```

2. Open Firefox and navigate to:
   ```text
   about:debugging#/runtime/this-firefox
   ```

3. Click **Load Temporary Add-on…**

4. Navigate into the `linkedin-feed-filter` folder and select **`manifest.json`**.

5. **Done.** Open LinkedIn and click the extension icon. If Firefox asks for permission to access LinkedIn, click **Abilita su LinkedIn** directly in the popup or in the browser prompt.

---

## 💡 How to Use

1. Click the **LinkedIn Filter** icon in your toolbar.
2. Type a word or phrase in the text box (e.g. `webinar`, `crypto`, `hiring`, `AI prompts`) and press **Enter** or click **Aggiungi**.
3. Pick your preferred mode:
   - *Nascondi del tutto* (completely removes matching cards).
   - *Collassa con barra* (shows a discreet placeholder with a toggle).
4. Browse [linkedin.com/feed](https://www.linkedin.com/feed/): matching posts are filtered as they appear.

---

## 📂 Repository Structure

```text
linkedin-feed-filter/
├── assets/
│   └── demo.gif             # Showcase animation
├── icons/                   # Multi-resolution extension icons (16, 48, 128px)
├── content.js               # Feed observer, DOM batching & filtering engine
├── content.css              # Styling for hidden and collapsed post cards
├── popup.html               # Clean, accessible settings popup
├── popup.css                # Dark & light mode UI styling
├── popup.js                 # Keyword management and sync logic
├── manifest.json            # Manifest V3 (Chrome + Firefox compatible)
├── scripts/
│   └── generate_icons.py    # Icon generator utility
├── PRIVACY.md               # Privacy policy (Italian + English)
└── README.md
```

---

## 🔧 When LinkedIn Changes Its Page

LinkedIn rewrites its feed markup from time to time. When that happens a filter based on page selectors stops recognising posts. This extension handles it in three steps:

1. **Tiered selectors.** `content.js` tries the current feed structure first, then the previous one, then a generic fallback (list items with enough text, feed page only).
2. **Visible warning.** If the feed is open and no post has been recognised after a few seconds, the popup shows a warning.
3. **One place to fix.** All selectors live in a single block at the top of `content.js`. Updating that block and bumping the version is the whole fix.

---

## 🌐 Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome / Chromium | ✅ Tested | Automated tests on Chromium with a simulated feed, plus a manual check on the live feed |
| Firefox 142+ | ✅ Tested on 160 | Automated tests on Firefox 160 with a simulated feed. 142 is the declared minimum, not tested |
| Brave, Edge, Opera | Expected to work | Chromium-based, not tested as an installed extension |
| Safari | ❌ Not supported | Requires Safari Web Extension conversion |

---

## 🤝 Community & Contributions

This project was built to give the community a way to keep their LinkedIn feed focused on the topics they care about.

Contributions, feature requests, and improvements are very welcome:
- Found an unhandled LinkedIn post format? Open an [Issue](https://github.com/backpropagation6/linkedin-feed-filter/issues).
- Want to add a new feature? Feel free to submit a [Pull Request](https://github.com/backpropagation6/linkedin-feed-filter/pulls).

---

## ⚠️ Disclaimer

This is an independent project. It is not affiliated with, endorsed by, or sponsored by LinkedIn Corporation. LinkedIn is a trademark of LinkedIn Corporation.

The extension changes how the feed is displayed in your own browser. LinkedIn's User Agreement restricts third-party software that modifies the appearance of its pages, and LinkedIn states that it may restrict accounts that use such software. Read the [User Agreement](https://www.linkedin.com/legal/user-agreement) and decide for yourself before installing.

---

## 📄 License

Distributed under the [MIT License](LICENSE). Built for the community with ❤️.
