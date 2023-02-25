import { persist, createCookieStorage } from '@macfja/svelte-persistent-store';
import { writable } from 'svelte/store';

export const key = persist(writable(''), createCookieStorage(), 'key');
