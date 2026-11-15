# Tempo

A flexible interval timer built with React, TypeScript, Vite, and dnd-kit. Named timelines and a separate working draft are stored in this browser. No account or server is required.

## Run locally

Use Node.js 22.12 or newer. If you use nvm, run `nvm use` to select the version in `.nvmrc`.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Use `npm test` for timer and routine tests, and `npm run build` for type checking and a production build in `dist/`.

## Saved timelines and working drafts

Use the chooser arrow beside the editable timeline title to load a saved timeline as an independent working draft. Changes to the draft survive refreshing or reopening the page but do not modify the saved original. **Save** updates that original; **Save as new** keeps a separate named variation. Edit the timeline name directly above the intervals, just like interval and series names. Name edits also stay in the draft until Save. **New timeline** in the chooser starts an empty draft. Before replacing unsaved edits, choose Save, Discard changes, or Cancel.

The timeline options menu contains Duplicate, Import…, Export, Export all timelines, and Delete. Duplicate copies the saved baseline (save temporary edits first if you want them included). Names must be nonblank and unique, ignoring letter case. Deleting a saved timeline requires confirmation.

Export downloads the current working timeline as a `.tempo.json` file, including temporary edits. Export all timelines downloads `tempo-timelines.json`, containing saved versions only. Import… accepts both formats: individual timelines up to 1 MB open as unsaved drafts; Save adds them to the library. Library files up to 10 MB add all imported timelines without replacing existing entries or changing the current working draft. Conflicting names receive numbered suffixes. Entire files are validated before adding any timelines. Empty drafts, zero-duration unfinished intervals, and repeated series are supported. Unsupported versions, malformed data, duplicate IDs, and invalid durations or rounds are rejected without changing your draft.

The library and draft use the versioned `tempo.library.v2` localStorage key. Existing `tempo.routine.v1` routines migrate to “My timeline”; the legacy entry is retained. Clearing browser data removes the library and draft. Save failures display a warning with a retry option; export the draft to preserve a file backup. Files provide manual transfer between browsers or devices; there is no automatic synchronization.

## Editing and playback

Edit interval names and minutes/seconds directly. Series hold intervals and have a Rounds control (1–99 total plays, default 1). Totals include every round; the player displays the current round. Series navigation skips all remaining rounds to the next top-level block. Older saved routines retain one round. Drag the handles or use the up/down buttons to reorder. The item options menu duplicates, deletes, and moves intervals between series and the timeline. Deleting a series deletes its contained intervals.

**Start** switches to the player. Navigation resets the destination interval and preserves running/paused state. Series controls move between top-level blocks, including standalone intervals. Stop & reset pauses at the beginning; returning to the editor ends the session. Sound can be previewed or muted.

The timeline overview shows the whole routine with interval widths proportional to duration, stronger boundaries between top-level blocks, and dashed round boundaries. Its marker shows the current position; passed portions include intervals skipped using navigation. The overview is display-only.

The timer uses elapsed-time deadlines to avoid accumulated drift. Delayed browser callbacks catch up without replaying missed cues. Keep the page visible and the screen on: background or locked-screen playback is not supported. Screen wake lock is requested where supported on a secure origin (HTTPS or localhost). Browser audio permissions and device volume still apply.

The initial example routine can be edited or deleted. Audio failures display a message.

## Languages

The interface supports English and Spanish. On first use, Tempo chooses the first supported browser language, falling back to English. The language menu in the header switches immediately and saves an explicit choice on this device. Switching languages preserves the current draft and timer session; existing timeline, series, and interval names remain unchanged. New items and the initial example use the selected language. The language preference is separate from timeline storage and is not included in exports.

Translations live in `src/locales/en.json` and `src/locales/es.json`, using i18next interpolation and plural forms. To add a language, add a matching catalog and register its resources and native display name in `src/i18n.ts`. Extend the catalog parity tests in `src/i18n.test.tsx` to cover it. Keep message keys and interpolation parameters consistent; translate visible labels, errors, and accessibility text together. User-created names and the `MM:SS` timer format are not translated.

## Publish with GitHub Pages

This repository is prepared for a public GitHub repository named `tempo`. Production assets use `/tempo/`; local development continues to use `/`. If you choose a different repository name, update `base` in `vite.config.ts` before publishing. No server, account database, or deployment secrets are needed.

1. Create an empty public repository named `tempo` on GitHub, without adding a README or other initial files.
2. Connect this local repository using the GitHub repository's remote URL, then push `main`:

   ```sh
   git remote add origin <repository-remote-url>
   git push -u origin main
   ```

3. In the GitHub repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
4. Open **Actions → Check and deploy GitHub Pages → Run workflow**, selecting `main`. If the first push ran before Pages was enabled, run the workflow again after completing step 3.
5. Once deployment succeeds, open the website URL shown by the `github-pages` environment on the workflow run.

Later pushes to `main` automatically test, build, and deploy. Pull requests run formatting, tests, and a production build without publishing. Deployment uses GitHub's built-in token with permissions limited to the deployment job; no personal access token is stored in the project.

To check the production build locally:

```sh
npm run build
npm run preview
```

Open `http://127.0.0.1:4173/tempo/`. The preview server is for checking the built site, not for public hosting.

Saved timelines and working drafts are browser data, not repository files. Before moving from the local preview to the published website, use **Export all timelines** and **Export** for any temporary draft you want to keep. Import those files on the published website. Publishing does not add PWA installation or offline support.

Deployment setup follows the [Vite GitHub Pages guide](https://vite.dev/guide/static-deploy#github-pages) and [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
