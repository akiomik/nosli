import { redirect } from '@sveltejs/kit';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { key } from '$lib/stores/cookie';

export function load() {
  if (browser && get(key) === '') {
    throw redirect(302, '/');
  }
}
