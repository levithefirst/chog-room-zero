# Bullet Echo reference map (RC-7)

Source: `room-zero-bullet-echo-reference.pdf`, 19 screenshots, one per page, all inspected on 2026-10-13. Nothing is
copied: no Bullet Echo art, characters, names, branding or layout assets. Room Zero keeps its own look (dark
basement, gold signal colour, the operator token seen from above) and only borrows the *ideas* listed here.

Status: **Implemented** (new in RC-7), **Present** (already in the game, possibly polished), **Deferred** (not built,
with the reason). Where a feature repeats across pages it is counted once.

| Pages | What the screenshots show | Room Zero | Where / why |
|---|---|---|---|
| 1 | Key-art loading screen, step progress "1/5 Connecting to servers" | **Implemented** | `#boot` in `index.html`, steps in `src/main.ts`: 4 real local steps (fonts, renderer, Chog check, map bake). No server step, because there is no game server. Failure shows the reason and Retry. |
| 2-3 | Nickname dialog (field, Apply), "Profile registration complete" | **Implemented** | Callsign dialog (`src/ui/screens.ts nickHtml`, `src/ui/profile.ts validateNickname`): 3-16 chars, letters/numbers/space/dot/dash/underscore, "Saved." feedback, edit from the player card. Not forced before the first run: anyone can play at once (LOCKED 9); the menu chip asks for a callsign with a NEW badge until one is set. |
| 4-5 | Two hands on a landscape phone: joystick left moves, right side turns; "tap to continue" | **Implemented** | How to play now has a controls diagram (`src/ui/art.ts controlsSvg`): touch shows the two-thumb landscape grip, PC shows WASD, mouse, Space, R. Replayable from the menu and Settings. |
| 6-9 | In-match contextual tips ("Collect ammo...", "Grab armor...", "Take a medkit..."), "!" marker on the pickup, a ring and name when collected, HUD (alive count, health/armour bar, ammo, heal button) | **Implemented** + **Present** | Tips (`src/ui/tips.ts`): health, armour, ammo, reload, being hit, blocked shot, ability; each shown once, only for real state (a pickup must be in your lamp and actually wanted), never over the opening instruction; Settings can turn them off or replay them. A pickup you would take now pulses (`render.ts drawPickups`); taking one names what it gave ("+35 ARMOUR") with a ring in its colour. HUD, overhead bar, pickup labels, ammo and ability buttons were already present. |
| 10 | Main menu: player avatar + name, mode list, Heroes, Shop, chests, currencies, settings/news/chat/friends icons, big Play | **Implemented** (core) / **Deferred** (rest) | New menu (`titleHtml`): player chip (callsign, profile id, favourite operator token), nav (Player card, Medals, How to play, Chog DEMO, Settings), operator showcase, big Play. **Deferred:** shop, chests, currencies, leagues, contracts, news, chat, friends, teams: none of these systems exist, and several are out of scope by LOCKED 12 (loot chests, clans, economy). No empty screens for them. |
| 11-13 | Hero collection: portrait cards, name, rarity, "can be found in a chest", Heroes/Drones tabs | **Implemented** (adapted) | Operator select (`selectHtml`): original portraits drawn from the in-game token (`portraitSvg`), role, stat bars, weapon, ability, career line (runs, clears, best), favourite star. No rarity or chest unlocks: all four operators are open to everyone, and there are no drones. |
| 14 | Player card with "This is your player card" tutorial overlay; customise avatar, frame, background, medals, favourite hero | **Implemented** (honest subset) | Player card (`profileHtml`): callsign + edit, profile id, favourite operator portrait, three medal pins, linked sign-ins. Customisation is limited to what exists (favourite operator, pinned medals). No frames, backgrounds or gallery. |
| 15 | Player tab: name, profile id, trophies, syndicate, global stats per mode | **Implemented** (local) | Player tab: career on this device (runs, clears, clear rate, best, kills, accuracy, damage, time, pickups, abilities, medals), labelled "on this device · no global leaderboard". No trophies or syndicates. |
| 16 | Equipment: weapon tuning slots, gear set grid, summary stats | **Deferred** (shown as Loadout) | Loadout tab shows the real weapon and ability numbers and pickup values, and says there are no upgrades. Weapon tuning and a gear grid are out of scope (LOCKED 12 "gear grid") and would add stat advantages the game avoids. |
| 17 | Heroes tab: per-hero stat card, tap to pin | **Implemented** | Operators tab: per-operator runs, clears, best, kills, accuracy; "Set favourite" pins it to the card. |
| 18 | Medals: progress to next reward, medal cards (rarity, name, x/y progress), tap to pin, sort | **Implemented** | 12 medals (`src/ui/medals.ts`) from tracked play only, with rarity, description, progress bar and earned state; tap an earned medal to pin (3 max); earned medals appear on the results screen. No rewards: a medal is a record, not a currency. |
| 19 | Settings: vibration, volume, voice chat, music, sound, Google sign-in, profile id, language, region, graphics, help, about, ads, logs, promo codes, deletion, socials | **Implemented** (real ones) / **Deferred** (rest) | Settings (`settingsHtml`): volume, sound on/off, touch stick size, vibration (disabled with the reason where the browser has none), tips, replay tutorial, graphics quality (render resolution), full screen (touch), profile id, sign-in (Google, MetaMask, Rabby, Zerion), reset progress (with confirm), about (build commit). **Deferred:** music (the game has none; every sound is a cue), voice chat, language, region, ads, logs, promo codes, socials. |

Visual system (all pages): one panel style, one gold accent for primary actions and progress, mono numbers, back
button top-left on every sub-screen, tabs with an underline, focus/hover/pressed/disabled states, and compact rules
for short landscape phones (`body.compact`). Every screen was screenshot-checked at 1440x900, 1280x720, 1180x820,
844x390, 667x375 and upright 390x844 / 375x667 (turned landscape stage) with `tools/rc7-menus.mjs`.

## Briefs (RULES section 6)

```
BRIEF: Player card, medals, settings, tips (RC-7)
PURPOSE      Runs left no trace beyond a best time; nothing taught a mechanic at the moment it mattered.
GAMEPLAY     Chase a medal (clear untouched vs clear fast); pick and pin a favourite; turn tips off once learned.
NFT RELATION Not NFT related. The DEMO token history stays separate and labelled.
PLAYER FEEL  A record of real play; tips appear at most once each, ~9 s into a first run at the earliest.
TECH COST    ~1 day; src/ui/{profile,medals,tips,screens,art}.ts, index.html CSS; no dependency.
RISK         Menu clutter; tips stacking on the HUD. Mitigated: one pill at a time, 3 s gap, honest empty states.
SCOPE        Cuts from the reference: shop, chests, currencies, leagues, clans, weapon tuning, gear grid, voice chat.
QUALITY BAR  Fake numbers or empty screens would be mediocre; every figure shown is tracked, every screen is real.
VERDICT      KEEP (owner mandate 2026-10-13).
```

```
BRIEF: Sign-in (Google, MetaMask, Rabby, Zerion) (RC-7)
PURPOSE      Owner wants account identity and a safe path to cross-device progress.
GAMEPLAY     None; guests play everything. Signing in links a proven identity to the device's player card.
NFT RELATION Kept apart from NFT ownership: sign-in never checks or claims Chog ownership.
PLAYER FEEL  Optional, one tap from Settings; never blocks play.
TECH COST    ~0.5 day; api/auth/* (Vercel functions), src/ui/auth.ts; @noble/curves + @noble/hashes (server-only).
RISK         Secrets in the client; replayed signatures; fake "accounts" without storage. See docs/AUTH.md.
SCOPE        Cuts: server-side save/accounts (needs a database: owner choice), WalletConnect (needs a project id),
             chain-specific features (Monad/Robinhood chain ids UNKNOWN).
QUALITY BAR  Saying "account" when there is no account storage would mislead; the UI says progress stays on the device.
VERDICT      MODIFY: identity verification now; cloud save after the owner picks a database.
```
