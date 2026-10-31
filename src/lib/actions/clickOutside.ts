// from https://svelte.dev/repl/8031c800d7e34fd692dd18174b514e4e?version=3.55.1

import type { Action } from 'svelte/action';

export const clickOutside: Action<HTMLElement, () => void> = (element, cb) => {
  function onClick(event: MouseEvent) {
    if (event.target !== null && !element.contains(event.target as HTMLElement)) {
      cb();
    }
  }

  document.body.addEventListener('click', onClick);

  return {
    update(updatedCb: () => void) {
      cb = updatedCb;
    },
    destroy() {
      document.body.removeEventListener('click', onClick);
    }
  };
};
