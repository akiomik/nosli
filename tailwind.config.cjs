const config = {
  darkMode: 'class',

  content: [
    './src/**/*.{html,js,svelte,ts}',
    require('path').join(require.resolve('@skeletonlabs/skeleton'), '../**/*.{html,js,svelte,ts}')
  ],

  theme: {
    extend: {}
  },

  plugins: [
    require('@tailwindcss/forms'),
    require('@skeletonlabs/tw-plugin').skeleton({ themes: { preset: ['skeleton'] } })
  ]
};

module.exports = config;
