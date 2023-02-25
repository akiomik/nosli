import { persist, createCookieStorage } from '@macfja/svelte-persistent-store';
import { writable } from 'svelte/store';

export const npub = persist(writable(''), createCookieStorage(), 'npub');
