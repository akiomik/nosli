<script lang="ts">
  import { _ } from 'svelte-i18n';

  import { darkMode, relaySource, linkTarget } from '$lib/stores/cookie';
</script>

<div class="flex flex-col space-y-6 min-w-[16rem]">
  <fieldset class="flex flex-col space-y-2">
    <legend class="font-bold mb-2">{$_('settings.theme')}</legend>
    <label class="flex items-center space-x-2">
      <input type="radio" bind:group={$darkMode} value={false} />
      <span>{$_('light-mode')}</span>
    </label>
    <label class="flex items-center space-x-2">
      <input type="radio" bind:group={$darkMode} value={true} />
      <span>{$_('dark-mode')}</span>
    </label>
  </fieldset>

  <fieldset class="flex flex-col space-y-2">
    <legend class="font-bold mb-2">{$_('settings.relay-source')}</legend>
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

  <fieldset class="flex flex-col space-y-2">
    <legend class="font-bold mb-2">{$_('settings.link-target')}</legend>
    <label class="flex items-center space-x-2">
      <input type="radio" bind:group={$linkTarget} value="nostter" />
      <span>nostter</span>
    </label>
    <label class="flex items-center space-x-2">
      <input type="radio" bind:group={$linkTarget} value="lumilumi" />
      <span>Lumilumi</span>
    </label>
    <label class="flex items-center space-x-2">
      <input type="radio" bind:group={$linkTarget} value="nos-haiku" />
      <span>Nos Haiku</span>
    </label>
    <label class="flex items-center space-x-2">
      <input type="radio" bind:group={$linkTarget} value="nostrudel" />
      <span>NoStrudel</span>
    </label>
    <label class="flex items-center space-x-2">
      <input type="radio" bind:group={$linkTarget} value="coracle" />
      <span>Coracle</span>
    </label>
    <label class="flex items-center space-x-2">
      <input type="radio" bind:group={$linkTarget} value="primal" />
      <span>Primal</span>
    </label>
    <label class="flex items-center space-x-2">
      <input type="radio" bind:group={$linkTarget} value="iris" />
      <span>iris</span>
    </label>
    <label class="flex items-center space-x-2">
      <input type="radio" bind:group={$linkTarget} value="snort" />
      <span>Snort</span>
    </label>
    <label class="flex items-center space-x-2">
      <input type="radio" bind:group={$linkTarget} value="yakihonne" />
      <span>Yakihonne</span>
    </label>
  </fieldset>
</div>
