import type { Action } from 'svelte/action';

// Focuses the element when `focus` becomes true, if the focus has fallen to the body, as it does
// when the button that the user pressed leaves the page. The check waits for the update that removes
// that button to end. A value that stays true does nothing, since Svelte can pass it again.
export const focusWhen: Action<HTMLElement, boolean> = (node, focus) => {
  let focused = false;
  const update = (focus: boolean) => {
    if (focus && !focused) {
      queueMicrotask(() => {
        if (
          node.isConnected &&
          (!document.activeElement || document.activeElement === document.body)
        ) {
          node.focus();
        }
      });
    }
    focused = focus;
  };
  update(focus);
  return { update };
};
