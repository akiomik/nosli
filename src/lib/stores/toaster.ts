import { createToaster } from '@skeletonlabs/skeleton-svelte';

// Success toasts otherwise close after 2 seconds, so keep the 5-second timeout from Skeleton v2.
export const toaster = createToaster({ placement: 'bottom-end', duration: 5000 });
