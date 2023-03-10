import { persist, createCookieStorage } from '@macfja/svelte-persistent-store';
import { writable } from 'svelte/store';

export const pubkey = persist(writable(''), createCookieStorage(), 'pubkey');
export const seckey = persist(writable(''), createCookieStorage(), 'seckey');
export const nip07 = persist(writable(false), createCookieStorage(), 'nip07');
