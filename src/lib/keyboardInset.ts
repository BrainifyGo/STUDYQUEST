/**
 * Get out of the way while the on-screen keyboard is up.
 *
 * WHY. On a phone the bottom nav and the music bar are both fixed to the bottom
 * of the screen, and iOS Safari keeps fixed elements pinned to the *visual*
 * viewport — so when the keyboard opens they ride up and sit directly on top of
 * the page. A mobile test of the Friends screen showed the result: the keyboard
 * took roughly two thirds of the screen, and of the sliver left, the nav and the
 * music bar covered the friends list the person was typing into the box to find.
 *
 * Nothing down there is any use mid-sentence. Neither is a navigation bar you
 * cannot see the destination of. Both go away until the keyboard closes, and the
 * space they were reserving goes back to the page.
 *
 * HOW IT DETECTS. By measuring, not by guessing from focus events. A focused
 * input does not always mean a keyboard (a hardware keyboard, an iPad with a
 * case, a date picker), and a keyboard can close while the field keeps focus —
 * so focus is the wrong signal in both directions. `visualViewport` shrinking by
 * a large amount is the keyboard, and it is right in all four cases.
 *
 * Browsers without `visualViewport` (none that matter now) simply never fire
 * this, and the layout stays exactly as it was.
 */

/**
 * How much the viewport has to shrink before we call it a keyboard.
 *
 * Deliberately well above the ~60-100px that Safari's collapsing address bar
 * moves, and well below the ~300px a keyboard takes, so neither case is close to
 * the line.
 */
const KEYBOARD_MIN_PX = 160;

export function watchKeyboard(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};

  const update = () => {
    // The layout viewport minus the visible one. Positive means something is
    // covering the bottom of the page.
    const covered = window.innerHeight - vv.height;
    if (covered > KEYBOARD_MIN_PX) document.body.dataset.keyboard = 'open';
    else delete document.body.dataset.keyboard;
  };

  vv.addEventListener('resize', update);
  // Scrolling the visual viewport does not change its height, but iOS fires
  // resize and scroll in a different order depending on how the keyboard opened.
  vv.addEventListener('scroll', update);
  update();

  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
    delete document.body.dataset.keyboard;
  };
}
