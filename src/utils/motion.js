// ─────────────────────────────────────────────────────────────────────
// Motion design tokens — the single source of truth for easing curves.
//
// Four curves cover every animation on the Aero desktop + iOS shell
// (M3 and the Android theme keep their own Material motion systems):
//
//   SPRING — Apple's sheet/morph spring. Card morphs, window FLIPs,
//            edge-swipe snaps, anything that travels between two rects.
//   OUT    — quick decisive deceleration for micro-interactions:
//            pressed states, hovers, small reveals.
//   GLIDE  — long graceful glide for big passive movement: intros,
//            auto-advancing carousels, item cascades.
//   BOUNCE — playful overshoot for celebration moments: stamps,
//            badges, finale dots.
//
// styles.css mirrors these as --ease-spring / --ease-out / --ease-glide /
// --ease-bounce for stylesheets. Keep both places in sync — JS needs the
// literals because the Web Animations API can't resolve var().
// ─────────────────────────────────────────────────────────────────────

export const EASE_SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const EASE_OUT = 'cubic-bezier(0.2, 0.7, 0.2, 1)';
export const EASE_GLIDE = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const EASE_BOUNCE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
