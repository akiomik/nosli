import { redirect } from '@sveltejs/kit';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { seckey } from '$lib/stores/cookie';

export function load() {
  if (browser && get(seckey) === '') {
    throw redirect(302, '/');
  }
}
