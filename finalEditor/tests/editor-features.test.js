/**
 * End-to-end tests for general editor features: paste sanitization,
 * paste-into-code, URL-over-selection linking, auto-lists, list splitting
 * and exiting, headings, inline formatting, link insertion via the modal,
 * the "clear" command, and autosave to localStorage.
 *
 * See tests/README.md for requirements and usage.
 */
const { launchEditor, check, report } = require('./helpers');

(async () => {
  const { browser, page, html, resetEditor, formatCommand, selectWord, paste } = await launchEditor();

  // ── 1. Pasting HTML strips non-whitelisted elements/attributes ──
  await resetEditor();
  await paste({
    text: 'ignored plain fallback',
    html: '<div><strong>fat</strong> and <em>slanted</em> and ' +
      '<span style="color:red">styled</span></div>' +
      '<script>alert(1)</script>' +
      '<a href="javascript:alert(2)">evil</a> ' +
      '<a href="https://example.com">fine</a>' +
      '<img src="x.png" onerror="alert(3)">' +
      '<table><tr><td>cell</td></tr></table>',
  });
  let h = await html();
  check('pasted <strong> is converted to <b>', /<b>fat<\/b>/.test(h), h);
  check('pasted <em> is converted to <i>', /<i>slanted<\/i>/.test(h), h);
  check('pasted <span> is unwrapped, text kept', !h.includes('<span') && h.includes('styled'), h);
  check('pasted <script> element is removed', !h.includes('<script'), h);
  check('javascript: href is stripped', !h.includes('javascript:'), h);
  check('allowed link is kept and opens in a new tab',
    /<a href="https:\/\/example\.com" target="_blank">fine<\/a>/.test(h), h);
  check('pasted <img> is removed', !h.includes('<img'), h);
  check('pasted <table> is unwrapped, cell text kept', !h.includes('<table') && h.includes('cell'), h);
  check('no style attributes survive the paste', !h.includes('style='), h);

  // ── 2. Pasting a URL over selected text turns it into a link ──
  await resetEditor();
  await page.keyboard.type('click here now');
  await selectWord('here');
  await paste({ text: 'https://example.org/page' });
  h = await html();
  check('URL pasted over selection wraps it in a link',
    /<a href="https:\/\/example\.org\/page" target="_blank">here<\/a>/.test(h), h);

  // ── 3. Pasting into inline code inserts plain text (newlines collapsed) ──
  await resetEditor();
  await page.keyboard.type('run ');
  await formatCommand('c');
  await paste({ text: 'npm\ninstall', html: '<p><b>npm</b></p><p>install</p>' });
  h = await html();
  check('paste into inline code stays inside as plain text',
    /<code>\u200Bnpm install<\/code>/.test(h), h);

  // ── 4. Auto-list: typing "-" starts a list; Enter/double-Enter behavior ──
  await resetEditor();
  await page.keyboard.type('-');
  h = await html();
  check('typing "-" converts the paragraph to a list', /<ul><li>/.test(h), h);

  await page.keyboard.type('first');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second');
  h = await html();
  check('Enter at end of a list item creates the next item',
    /<ul><li>first<\/li><li>second[^<]*<\/li><\/ul>/.test(h), h);

  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('after');
  h = await html();
  check('double Enter in an empty item exits the list into a paragraph',
    /<\/ul><p>after/.test(h) && !/<li>[^<]*after/.test(h), h);

  // ── 5. Format modal: heading conversion ──
  await resetEditor();
  await page.keyboard.type('My Title');
  await formatCommand('h2');
  h = await html();
  check('"h2" converts the paragraph to a heading', /<h2>My Title<\/h2>/.test(h), h);

  // ── 6. Format modal: bold on a selection ──
  await resetEditor();
  await page.keyboard.type('make this bold');
  await selectWord('this');
  await formatCommand('b');
  h = await html();
  check('"b" bolds the selected word', /<b>this<\/b>/.test(h), h);

  // ── 7. Format modal: link insertion via the "l" sub-form ──
  await resetEditor();
  await page.keyboard.type('see ');
  await formatCommand('l');
  await page.waitForSelector('.format-modal input[placeholder="Link text"]');
  await page.type('.format-modal input[placeholder="Link text"]', 'the docs');
  await page.type('.format-modal input[placeholder="https://..."]', 'https://docs.example.com');
  await page.keyboard.press('Enter');
  h = await html();
  check('"l" inserts a link with text and href',
    /<a href="https:\/\/docs\.example\.com" target="_blank">the docs<\/a>/.test(h), h);

  // ── 8. Format modal: "clear" wipes the editor ──
  await resetEditor();
  await page.keyboard.type('some content to destroy');
  await formatCommand('clear');
  h = await html();
  check('"clear" resets the editor to an empty paragraph', h === '<p><br></p>', h);

  // ── 9. Autosave: content is persisted to localStorage after the debounce ──
  await resetEditor();
  await page.keyboard.type('persist me');
  await new Promise(r => setTimeout(r, 1500)); // save debounce is 1s
  const stored = await page.evaluate(() => localStorage.getItem('textEditor_app_data') || '');
  check('typed content is saved to localStorage', stored.includes('persist me'), stored.slice(0, 300));

  await browser.close();
  report();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
