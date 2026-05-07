<script lang="ts">
  import { relaySource } from '$lib/stores/cookie';
</script>

<fieldset class="flex flex-col space-y-2 mt-4 pt-4 border-t border-surface-300">
  <label class="flex items-center space-x-2">
    <input type="radio" bind:group={$relaySource} value="kind10002" />
    <span>kind:10002</span>
  </label>
  <label class="flex items-center space-x-2">
    <input type="radio" bind:group={$relaySource} value="kind3" />
    <span>kind:3</span>
  </label>
  <label class="flex items-center space-x-2">
    <input type="radio" bind:group={$relaySource} value="default" />
    <span>default</span>
  </label>
</fieldset>
