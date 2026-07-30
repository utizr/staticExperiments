# Editor end-to-end tests

These tests open `index.html` in a real headless Chrome instance and drive the
editor with actual keystrokes and synthetic clipboard events (via
`puppeteer-core`). Shared setup lives in `helpers.js`.

## Suites

**`inline-code.test.js`** — the format modal's code commands:

- `c` in a non-empty paragraph inserts an inline `<code>` element and typing
  stays inside it
- `e` (exit formatting) moves the caret out of inline code so subsequent
  typing is plain text
- `e` immediately after inserting inline code removes the empty `<code>`
- `c` with a text selection wraps the selection in inline `<code>`
- `c` in an empty paragraph inserts a `<pre><code>` block with an escape
  paragraph after it

**`editor-features.test.js`** — general editor behavior:

- Paste sanitization: non-whitelisted elements are removed or unwrapped
  (`<script>`, `<img>`, `<span>`, `<table>`), `<strong>`/`<em>` are converted
  to `<b>`/`<i>`, `javascript:` hrefs and `style` attributes are stripped,
  and allowed links get `target="_blank"`
- Pasting a URL over selected text wraps the selection in a link
- Pasting into inline code inserts plain text (newlines collapsed)
- Auto-list: typing `-` starts a list; Enter creates the next item;
  double-Enter in an empty item exits the list
- Format modal: heading conversion (`h2`), bold on a selection (`b`),
  link insertion via the `l` sub-form, and `clear`
- Autosave: typed content lands in localStorage after the 1s debounce

A real browser is required because much of what these tests guard against —
caret-affinity quirks, `execCommand` behavior, clipboard handling — does not
reproduce in jsdom or similar DOM emulations.

## Requirements

- **Node.js** (any recent version; developed with v25)
- **Google Chrome** installed. The default path is
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (macOS);
  override with the `CHROME_PATH` environment variable if yours lives
  elsewhere. `puppeteer-core` does not download its own browser.

## Running

```bash
cd tests
npm install   # first time only, installs puppeteer-core
npm test
```

With a custom Chrome location:

```bash
CHROME_PATH="/path/to/chrome" npm test
```

The run prints one `PASS`/`FAIL` line per assertion (failures include the
editor's HTML at that point, with zero-width spaces shown as `[ZWSP]`) and
exits non-zero if anything failed.
