/**
 * What the player does with the pointer they have.
 *
 * Every prompt in the game told the player to "tap", which on a desktop is
 * an instruction to do something they cannot do with the hardware in front
 * of them. A mouse is a fine pointer that hovers; a finger is neither.
 *
 * It lives in its own module rather than in the HUD because the opening
 * needs it before the HUD exists, and the HUD needs the opening's settings:
 * one of those two has to not depend on the other.
 */
export const TAP = (typeof matchMedia === 'function'
  && matchMedia('(hover: hover) and (pointer: fine)').matches) ? 'click' : 'tap';
