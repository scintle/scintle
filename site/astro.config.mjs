// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import starlightLlmsTxt from 'starlight-llms-txt';

const SITE = 'https://scintle.github.io';
// GitHub Pages serves the site under /scintle; without `base`, internal links 404 once deployed.
const BASE = '/scintle';
// Page counts only (decided 2026-11-24); set as a repository variable. The plugin itself sends only D26.
const UMAMI = process.env.UMAMI_WEBSITE_ID;

export default defineConfig({
  site: SITE,
  base: BASE,
  integrations: [
    starlight({
      title: 'Scintle',
      description: 'Your AI chats, turned into a history of your ideas. Scintle keeps the story of every idea: how it started, how it changed, and where it ended up.',
      logo: { src: './src/assets/mark.svg' },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/brand.css'],
      components: { Hero: './src/components/HomeHero.astro' },
      plugins: [starlightLinksValidator(), starlightLlmsTxt({ projectName: 'Scintle' })],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/scintle/scintle' }],
      editLink: { baseUrl: 'https://github.com/scintle/scintle/edit/main/site/' },
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: `${SITE}${BASE}/og.png` } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        ...(UMAMI ? [{ tag: /** @type {const} */ ('script'), attrs: { defer: true, src: 'https://cloud.umami.is/script.js', 'data-website-id': UMAMI } }] : []),
      ],
      sidebar: [
        {
          label: 'Start',
          items: [
            { label: 'What Scintle is', slug: 'start/what-it-is' },
            { label: 'Install', slug: 'start/install' },
            { label: 'Your first board', slug: 'start/first-board' },
          ],
        },
        {
          label: 'Using it',
          items: [
            { label: 'The board and its views', slug: 'using/views' },
            { label: 'Correcting the board', slug: 'using/correcting' },
            { label: 'Questions it asks', slug: 'using/questions' },
            { label: 'Folders Scintle reads', slug: 'using/folders' },
            { label: 'Planning an idea', slug: 'using/planning' },
            { label: 'Commands', slug: 'using/commands' },
          ],
        },
        {
          label: 'Trust',
          items: [
            { label: 'What it reads, stores and sends', slug: 'trust/privacy' },
            { label: 'Telemetry', slug: 'trust/telemetry' },
            { label: 'Known gaps in the beta', slug: 'trust/known-gaps' },
          ],
        },
        {
          label: 'Help',
          items: [
            { label: 'Troubleshooting', slug: 'help/troubleshooting' },
            { label: 'FAQ', slug: 'help/faq' },
            { label: 'Updating and uninstalling', slug: 'help/updating' },
            { label: 'Changelog', slug: 'help/changelog' },
          ],
        },
        {
          label: 'Under the hood',
          collapsed: true,
          items: [
            { label: 'How an idea keeps its identity', slug: 'under-the-hood/identity' },
            { label: 'How ideas are found', slug: 'under-the-hood/extraction' },
            { label: 'Design decisions', slug: 'under-the-hood/decisions' },
          ],
        },
      ],
    }),
  ],
});
