# Feel and controls

Status: Controls and the forbidden/required items are LOCKED (owner brief). Every number is a PROPOSAL, a starting guess to tune by hand. Units: 1 unit is about 1 meter. No hard frame-rate or latency requirement is binding until the G8 baseline exists on a Pixel 7 and an iPhone 13.

## Controls (LOCKED)

Mobile, landscape:
- Left thumb: move (analog stick).
- Right thumb: aim stick. Aims and fires while outside the aim deadzone. Back inside the deadzone, firing stops. No auto-fire on sight.
- Ability button: inside right-thumb reach.
- Test devices: Pixel 7 and iPhone 13.

PC:
- WASD move, mouse aims, left click fires, Space uses the ability.

Shared input the sim receives each tick: `{ moveX, moveY, moveScale, aimAngle, firing, abilityPressed }`. The sim does not know which device made it.

Forgiving touch (PROPOSAL): floating stick bases, stick keeps tracking if the thumb drifts, generous touch zones, safe-area insets, 48 px minimum targets, `touch-action: none`, pointer events, pointer-id multitouch, no scroll, zoom, long-press menu, or selection. Pause when the page is hidden.

Verify on the devices (do not assume): address bar resizing, safe areas, fullscreen availability, audio unlock on first touch, vibration support.

PC extras (PROPOSAL): Shift held for quiet walk. Crosshair readable on dark and light. No mouse smoothing added.

Quiet walk on mobile (PROPOSAL): partial stick push walks quietly, full push runs. Show a faint ring at the threshold.

## Movement (acceleration, turning, stopping are LOCKED requirements; values are guesses)
- Run about 4.2 u/s. Quiet walk about 55 percent of that.
- Reach full speed in about 70 to 90 ms. Stop in about 50 to 70 ms. Snappy, not floaty.
- Turning: decide and record whether the body turns at a limited rate toward the aim, or instantly. It must feel deliberate. Tune on device.
- Player radius about 0.35. Slide along walls. Never snag on tile seams.
- No stamina bar.

## Combat (projectiles and wall-blocking are LOCKED)
- Projectiles travel visibly. Speed guess 28 to 34 u/s. Walls stop them. Use swept collision so fast bullets cannot tunnel through thin walls.
- Time to kill: a few tenths of a second to one second at mid range. Lethal means a mistake matters, not that death is random.
- Enemy reaction delay after seeing the player: 250 to 450 ms, with a visible cue.
- Hit feedback, few layers, each one useful: flash on the target for 1 to 3 frames, a positioned impact sound, a hit-direction indicator toward the shooter for about 1 s. Kill: clear death read. Hit-stop at most about 40 ms and only on kills.

## Death and retry (PROPOSAL)
Short freeze, show where the killer was, restart in a few seconds. The player must know why they died.

## Camera and shake (purposeful only)
- Follow with smoothing of about 0.10 to 0.14 s and a small lookahead toward the aim.
- Shake only for taking damage and the player's own ability, at most about 3 px for about 120 ms, with one global setting to turn it off. Anything else is decoration and gets cut.

## Latency (PROPOSAL until baseline)
Read input at the start of each tick and apply it that same tick. No smoothing that adds lag to sticks or keys. Fixed 60 Hz sim step, render interpolates. Audio context created with the interactive latency hint and unlocked on first touch. Measure input-to-render delay in a debug overlay and record it on both phones.

## Ability (one only, LOCKED: no second ability)
Needs a readable wind-up (seen and heard), a visible cooldown, and a real cost to using it.
