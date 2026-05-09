import { writable } from 'svelte/store';

export const currentRelays = writable<string[]>([]);
