import { persist, createCookieStorage } from '@macfja/svelte-persistent-store';
import { writable } from 'svelte/store';

export const pubkey = persist(writable(''), createCookieStorage(), 'pubkey');
export const nip07 = persist(writable(false), createCookieStorage(), 'nip07');
export const darkMode = persist(writable(true), createCookieStorage(), 'darkMode');

export type RelaySource = 'kind10002' | 'kind3' | 'default';
export const relaySource = persist(
  writable<RelaySource>('kind10002'),
  createCookieStorage(),
  'relaySource'
);
