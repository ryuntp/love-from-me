# SealGuard design language

The head unit is a 15.6 inch, 1920x1080 panel read at arm's length while seated. iOS Human Interface Guidelines are the reference, scaled for a car. Every value below is a token; the implementation reads tokens, never literals.

## Scale

iOS point sizes assume a phone held 30 cm from the eye. The car screen sits about 70 cm away and is touched with a reaching arm, so every iOS size is multiplied by 1.5 and touch targets grow from 44 pt to 72 px minimum. Text never drops below 20 px.

## Type

Inter (SIL Open Font License) stands in for SF Pro. Inter Display for titles, Inter for everything else. Tabular numerals for voltages, pressures and timers.

| Role | Size px | Weight | Line height |
|---|---|---|---|
| Large title | 51 | 700 | 1.2 |
| Title 1 | 42 | 700 | 1.2 |
| Title 2 | 33 | 700 | 1.25 |
| Title 3 | 30 | 600 | 1.25 |
| Headline | 26 | 600 | 1.3 |
| Body | 26 | 400 | 1.3 |
| Callout | 24 | 400 | 1.3 |
| Subhead | 23 | 400 | 1.3 |
| Footnote | 20 | 400 | 1.3 |
| Caption | 20 | 500 | 1.2 |

## Color

Light and dark follow the head unit theme. Dark is the default because sentry is used at night and the panel must not glare while parked.

| Token | Light | Dark |
|---|---|---|
| bg.grouped | #F2F2F7 | #000000 |
| bg.groupedSecondary | #FFFFFF | #1C1C1E |
| bg.groupedTertiary | #F2F2F7 | #2C2C2E |
| label.primary | #000000 | #FFFFFF |
| label.secondary | rgba(60,60,67,0.60) | rgba(235,235,245,0.60) |
| label.tertiary | rgba(60,60,67,0.30) | rgba(235,235,245,0.30) |
| separator | rgba(60,60,67,0.29) | rgba(84,84,88,0.60) |
| fill.secondary | rgba(120,120,128,0.16) | rgba(120,120,128,0.32) |
| tint | #007AFF | #0A84FF |
| green | #34C759 | #30D158 |
| red | #FF3B30 | #FF453A |
| orange | #FF9500 | #FF9F0A |
| yellow | #FFCC00 | #FFD60A |
| indigo | #5856D6 | #5E5CE6 |

Status mapping: armed is green, alert is red, recording is orange, disarmed is label.secondary.

## Shape and depth

- Grouped inset list corner radius 16 px, card radius 20 px, sheet radius 24 px, button radius 18 px.
- Inset list rows: 84 px tall, 24 px horizontal padding, separator inset to the text start.
- Blur (backdrop-filter 20 px, saturate 180%) on the navigation bar and tab bar; a solid fallback color when blur is unsupported.
- Shadows are soft and rare: cards on the dashboard only, `0 8px 24px rgba(0,0,0,0.12)`.

## Components

- Navigation: a sidebar in landscape (iPadOS style, 420 px wide) that collapses into a bottom tab bar in portrait. Large title that shrinks on scroll.
- Lists: grouped inset lists for settings, with section headers in uppercase footnote and footers in footnote secondary.
- Controls: iOS switch (78x48 px), segmented control (pill, 60 px tall), stepper, slider with a value label.
- Status: a single hero card on the dashboard with the sentry state, a live camera mosaic thumbnail, the 12V voltage and time armed.
- Events: a timeline grouped by day, each row with a thumbnail, trigger icon, cameras involved and duration. Tap opens a sheet with the 2x2 player.
- Sheets and alerts: bottom sheets in portrait, centered cards in landscape; destructive actions in red at the bottom.
- Motion: 200 ms ease-out for state, 350 ms spring for sheets, respect reduced motion.

## Night and glare

A parked car must not light up the cabin. The app never raises brightness, and the sentry screen is a near-black surface with one small status glyph. Deterrent flashes are opt-in.
