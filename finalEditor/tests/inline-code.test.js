/**
 * End-to-end tests for the editor's code formatting (format modal "c" / "e"
 * commands), driven through a real headless Chrome instance.
 *
 * These exist because caret behavior around inline elements is highly
 * browser-specific: Chrome anchors the caret to the preceding inline element
 * at boundaries, which is exactly the class of bug unit tests in jsdom
 * cannot catch. See tests/README.md for requirements and usage.
 */
const { launchEditor, check, report } = require('./helpers');

(async () => {
  const { browser, page, html, resetEditor, formatCommand, selectWord } = await launchEditor();

  // ── 1. Inline code in a non-empty paragraph: type inside, exit, type outside ──
  await resetEditor();
  await page.keyboard.type('hello ');
  await formatCommand('c');
  await page.keyboard.type('mycode');
  let h = await html();
  check('typing after "c" goes into inline <code>', /<code>\u200Bmycode<\/code>/.test(h), h);

  await formatCommand('e');
  await page.keyboard.type(' outside');
  h = await html();
  check('typing after "e" lands outside the <code>',
    /<code>\u200Bmycode<\/code>/.test(h) && !/<code>[^<]*outside/.test(h) && h.includes('outside'), h);

  // ── 2. Insert inline code, immediately exit: empty <code> is removed ──
  await resetEditor();
  await page.keyboard.type('abc ');
  await formatCommand('c');
  await formatCommand('e');
  await page.keyboard.type('plain');
  h = await html();
  check('immediate "e" removes the empty <code>', !h.includes('<code>') && h.includes('plain'), h);

  // ── 3. Wrap a selection in inline code, then exit ──
  await resetEditor();
  await page.keyboard.type('wrap me please');
  await selectWord('me');
  await formatCommand('c');
  await page.keyboard.type('X');
  h = await html();
  check('"c" wraps the selection, typing extends it', /<code>meX<\/code>/.test(h), h);

  await formatCommand('e');
  await page.keyboard.type('Y');
  h = await html();
  check('"e" after wrap lands outside the <code>', /<code>meX<\/code>\u200BY/.test(h), h);

  // ── 4. "c" in an empty paragraph inserts a <pre><code> block ──
  await resetEditor();
  await formatCommand('c');
  await page.keyboard.type('const x = 1;');
  h = await html();
  check('"c" in empty paragraph creates a code block',
    /<pre><code>const x = 1;/.test(h), h);
  check('code block is followed by an escape paragraph', /<\/pre><p>/.test(h), h);

  await browser.close();
  report();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
