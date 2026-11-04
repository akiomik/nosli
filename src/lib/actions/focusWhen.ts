import type { Action } from 'svelte/action';

// Focuses the element when `focus` becomes true, if the focus has fallen to the body, as it does
// when the button that the user pressed leaves the page. The check waits for the update that removes
// that button to end.
export const focusWhen: Action<HTMLElement, boolean> = (node, focus) => {
  const update = (focus: boolean) => {
    if (!focus) return;
    queueMicrotask(() => {
      if (
        node.isConnected &&
        (!document.activeElement || document.activeElement === document.body)
      ) {
        node.focus();
      }
    });
  };
  update(focus);
  return { update };
};
