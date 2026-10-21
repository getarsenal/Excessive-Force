# Excessive Force on the App Store

The web game at getarsenal.app, wrapped as a native iOS app with Capacitor and
built to TestFlight by Codemagic, the way Leave Her Johnny ships. Nothing in
the game changes between the two: the App Store build is `npx vite build`'s
`dist`, copied into the native project by `npx cap sync ios`.

Identity: **Scheidel Holdings LLC**, bundle id
**`com.scheidelholdings.excessiveforce`**, version **1.0**, iPhone only, iOS
15 and up. The build number is the timestamp of the Codemagic run.

## What is in the repository (done)

| Piece | Where | Note |
|---|---|---|
| Capacitor config | `capacitor.config.ts` | `webDir: 'dist'`, no system inset, no scroll bounce, dark backdrop |
| Native project | `ios/` | the SPM template from Leave Her Johnny, rebranded; `ios/App/App/public` is generated and ignored |
| Pipeline | `codemagic.yaml` | builds on a push to the **`appstore`** branch; signs from the uploaded profile; uploads to TestFlight |
| App icon | `ios/App/App/Assets.xcassets/AppIcon.appiconset` | 1024×1024 RGB, no alpha (alpha is rejected at upload) |
| Launch screen | `Splash.imageset` + `LaunchScreen.storyboard` | the logo on the game's dark ground, 2732² |
| Privacy manifest | `ios/App/App/PrivacyInfo.xcprivacy` | no tracking, no data collected, UserDefaults reason CA92.1 |
| Info.plist | `ios/App/App/Info.plist` | `ITSAppUsesNonExemptEncryption=NO`, `arm64`, status bar hidden, all phone orientations, Games category |
| Native guards in the game | `src/main.js`, `src/ui/feedback.js` | no service worker under `capacitor://`; pulses go to the Taptic Engine through `@capacitor/haptics` |
| Size | `public/assets/characters` | the 61 portraits are WebP (18 MB) instead of PNG (155 MB) |
| Screenshots | `node tools/storeshots.mjs` | renders the 6.9" set (1320×2868) into `/tmp/out/store/` |

Checked here: `npx vite build` and `npx cap sync ios` run clean; the Xcode
project parses; the built game boots in native mode (fake Capacitor flag,
network blocked) without registering a worker and without errors. There is
no Mac in this sandbox, so the first Codemagic build is the first real
compile of the native project.

## Your side, in order

### 1. Apple Developer portal (once)

1. **Identifiers → App IDs → +**: App, bundle id
   `com.scheidelholdings.excessiveforce`, description "Excessive Force". No
   capabilities needed.
2. **Profiles → +**: App Store Connect distribution, that App ID, the **shared
   distribution certificate** the other apps use (do not make a new one).
   Name it "Excessive Force App Store". Download the `.mobileprovision`.

### 2. Codemagic (once)

1. **Add application** → this GitHub repository → "codemagic.yaml" as the
   configuration.
2. **Teams → Code signing identities → Provisioning profiles → upload** the
   `.mobileprovision`, reference name "Excessive Force App Store". The
   certificate is already there. Green check beside both.
3. The App Store Connect integration "Scheidel Holdings LLC" is already
   connected at team level; the yaml names it.

### 3. App Store Connect (once)

1. **My Apps → + → New App**: iOS, name **Excessive Force** (if taken, try
   "Excessive Force: Demolition"), primary language English (U.S.), the bundle
   id above, SKU `excessiveforce`.
2. **App Information**: category Games → Action, secondary Simulation. Content
   rights: does not contain third-party content (the landmark data is
   Overture/OpenStreetMap, ODbL, credited in-game).
3. **Pricing**: Free, all territories.
4. **App Privacy**: Data Not Collected. True: no account, no analytics, no ads,
   no server (boards and reminders are on-device).
5. **Age Rating**: Cartoon or Fantasy Violence **Frequent/Intense**; Realistic
   Violence **Infrequent/Mild** (stylised 3D, soldiers fall, no blood or gore);
   everything else None. Expect **12+**.

### 4. Cut a build

```
git push origin main:appstore
```

Codemagic builds in 15–25 minutes and the build lands in TestFlight. Install
it on your phone from TestFlight and play a level: audio after an app switch,
haptics, the safe areas, a full collapse, a Blitz, the studio recording's
share sheet.

### 5. Version 1.0 in App Store Connect

- **Screenshots**: iPhone 6.9" (1320×2868), three to ten. `node
  tools/storeshots.mjs` renders candidates; real ones from the TestFlight build
  are better. The first is the image an App Store link unfurls to.
- **Description, keywords, promotional text**: below.
- **Support URL**: a page with a contact email (the Leave Her Johnny support
  page's repository is the template: a public repository with one `index.html`
  and GitHub Pages on). **Privacy policy URL**: same, with the policy below.
  **Marketing URL**: `https://getarsenal.app`.
- **Review notes**: "No account or login. Everything runs on the device and
  the game plays offline. The title screen's CAMPAIGN row starts the first
  battle; Boot Camp (the tutorial) opens on a first launch. The destructible
  landmarks are built from public map data; the depiction is a stylised
  demolition sandbox, not a portrayal of real events, and no real person
  appears."
- Submit. "Manually release" if you want to time the launch.

## Review risks worth knowing before you submit

- **Real landmarks, some of them religious** (the Taj Mahal, Hagia Sophia,
  Saint Sava, Boudhanath, the Potala Palace, Chichen Itza) and **real
  nations' armies as the enemy**. Guideline 1.1.1 is about content that
  demeans a group; demolition games with real buildings have shipped, but a
  reviewer may ask. The review note above frames it; the stylised look helps.
  If it is rejected on this, the fallback is a flag in `levels.js` that keeps
  religious sites out of the iOS build.
- **Guideline 4.2 (minimum functionality)** is not a concern: this is a full
  game, not a wrapped website, and it runs offline.
- **Size**: about 160 MB installed. Fine for the store, but the cellular
  download prompt appears above 200 MB, so keep it there.

## Listing copy

**Subtitle (30):** Bring down the world's landmarks

**Promotional text (170):** Real landmarks on their real ground, laid up stone
by stone, brought down by your guns. Artillery, air strikes and an orbital
laser, across eighty cities. Offline, no account, no ads.

**Description:**
Excessive Force is a 3D artillery demolition game. Big Ben, the Eiffel Tower,
the Pyramids, the Taj Mahal, the Potala Palace and eighty more landmarks stand
on their real ground, built from real map data, every stone a stone. Lay your
battery, read the structure, and bring it down.

Place howitzers, mortars, rocket artillery and infantry teams with a finger.
Take a gun yourself in the gunner's seat. Call in an A-10, an AC-130, a B-1,
or burn a line across the city with an orbital laser. The garrison fires
back, reinforcements drop in, and the town burns around the fight.

A campaign of eight operations with bosses, a three-minute Blitz mode, a
weekly operation, seasons, leaderboards, a firing range, a hangar with
nose art for every aircraft, and a studio mode to film your best collapse.

Everything runs on your device. No account, no ads, no tracking, and the game
plays offline.

**Keywords (100):** artillery,demolition,physics,destruction,landmarks,war,
strategy,tower,collapse,siege,military,sandbox

**What's New (1.0):** First release on the App Store.

## Privacy policy (for the policy page)

Excessive Force, by Scheidel Holdings LLC, does not collect, transmit or
store any personal data. It needs no account. Progress, settings and records
are stored on the device and leave it only if you share them yourself (a
challenge link, a clip). The app makes no network requests of its own after
install beyond loading fonts. There are no analytics, no advertising and no
tracking. Questions: getarsenal.app@gmail.com.

## When the native project needs a change

Edit `ios/` by hand (no Mac here) or on a Mac with `npx cap open ios`. After
changing the Capacitor dependencies in `package.json`, run `npx cap sync ios`
and commit the regenerated `ios/App/CapApp-SPM/Package.swift`. Never commit
`ios/App/App/public`.

## What the native build does differently (and how to check it on the phone)

- **Records.** WKWebView can lose localStorage's last writes when the app is
  killed from the switcher, which lost a battle in progress in TestFlight.
  `src/core/store.js` mirrors every `tt.*` write into `@capacitor/preferences`
  (UserDefaults) and restores the mirror at boot. SETTINGS › TESTING › SAVED
  BATTLES says how many saves there are and what the store restored; COPY
  puts the headers and the store's boot report on the clipboard.
- **Sound.** Capacitor's asset handler serves a media file with no HTTP
  status, which a `fetch` that checks `ok` throws away: `fetchBytes` in
  `src/core/audio.js` takes the body anyway. The recorded clips are also
  shipped as mp3 and as AAC (`.m4a`) and the native app asks for the AAC
  first. SETTINGS › TESTING ›
  SOUND CLIPS says how many of the nine decoded and in which format; SOUND
  CHECK plays each one in turn; COPY sends the per-clip report with the
  decoder's error for any that failed. New or replaced clips go through
  `sh tools/clips.sh`.
