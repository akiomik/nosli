<script lang="ts">
  import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome';
  import { faGithub } from '@fortawesome/free-brands-svg-icons';
  import { faBolt } from '@fortawesome/free-solid-svg-icons';
  import ExternalLink from '$lib/components/ExternalLink.svelte';
  import FooterItem from '$lib/components/FooterItem.svelte';
</script>

<div class="p-8 flex justify-center">
  <ul class="list-none">
    <FooterItem>&copy; 2023 Nosli</FooterItem>
    <FooterItem>
      <ExternalLink href="https://github.com/akiomik/nosli" class="unstyled">
        <FontAwesomeIcon icon={faGithub} title="Open our Github repository" />
      </ExternalLink>
    </FooterItem>
    <FooterItem last={true}>
      <ExternalLink href="lightning:akiomik@stacker.news" class="unstyled">
        <FontAwesomeIcon icon={faBolt} title="Open our Lightning Address" />
      </ExternalLink>
    </FooterItem>
  </ul>
</div>
