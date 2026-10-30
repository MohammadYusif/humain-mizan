import { flushSync } from "react-dom"

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => unknown }

/**
 * Swap one view for another with a short crossfade (View Transitions API): the old view fades out
 * while the new one fades in, so there is never a blank or half-drawn frame. Falls back to an instant
 * update where unsupported, in a background tab, or when the user asks for less motion.
 */
export function smoothly(update: () => void) {
  const doc = document as ViewTransitionDocument
  if (
    !doc.startViewTransition ||
    document.hidden ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update()
    return
  }
  doc.startViewTransition(() => flushSync(update))
}
