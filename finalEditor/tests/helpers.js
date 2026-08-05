/**
 * Shared harness for the end-to-end editor tests.
 *
 * Launches the app's index.html in a real headless Chrome (via
 * puppeteer-core) and exposes helpers for driving the editor: resetting
 * content, submitting format-modal commands, selecting words, and
 * dispatching synthetic paste events with arbitrary clipboard payloads.
 */
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const EDITOR_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

/** Makes zero-width spaces visible in test output. */
const pretty = (s) => s.replace(/\u200B/g, '[ZWSP]');

let failures = 0;

function check(name, condition, actualHtml) {
  if (condition) {
    console.log(`PASS  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}`);
    console.log(`      html: ${pretty(actualHtml)}`);
  }
}

/** Prints the summary and exits with a non-zero code on failure. */
function report() {
  console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

async function launchEditor() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.goto(EDITOR_URL);
  await page.waitForSelector('#myEditor');

  const html = () => page.$eval('#myEditor', el => el.innerHTML);

  /** Resets the editor to a single empty paragraph with the cursor in it. */
  async function resetEditor() {
    await page.evaluate(() => {
      const el = document.getElementById('myEditor');
      el.innerHTML = '<p><br></p>';
      el.focus();
      const range = document.createRange();
      range.setStart(el.firstChild, 0);
      range.collapse(true);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
  }

  /** Opens the format modal (Cmd+J) and submits the given command. */
  async function formatCommand(cmd) {
    await page.keyboard.down('Meta');
    await page.keyboard.press('j');
    await page.keyboard.up('Meta');
    await page.waitForSelector('.format-modal input');
    await page.type('.format-modal input', cmd);
    await page.keyboard.press('Enter');
  }

  /** Selects the first occurrence of `word` inside the editor. */
  async function selectWord(word) {
    await page.evaluate((w) => {
      const el = document.getElementById('myEditor');
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const idx = node.textContent.indexOf(w);
        if (idx !== -1) {
          const r = document.createRange();
          r.setStart(node, idx);
          r.setEnd(node, idx + w.length);
          const sel = getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
          return;
        }
      }
      throw new Error(`word not found: ${w}`);
    }, word);
  }

  /**
   * Dispatches a synthetic paste event on the editor with the given
   * clipboard payload, e.g. paste({ text: 'plain' }) or
   * paste({ text: 'fallback', html: '<b>rich</b>' }).
   */
  async function paste({ text = '', html: htmlData = '' } = {}) {
    await page.evaluate(({ text, htmlData }) => {
      const el = document.getElementById('myEditor');
      const dt = new DataTransfer();
      if (text) dt.setData('text/plain', text);
      if (htmlData) dt.setData('text/html', htmlData);
      el.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }));
    }, { text, htmlData });
  }

  return { browser, page, html, resetEditor, formatCommand, selectWord, paste };
}

module.exports = { launchEditor, check, report, pretty };
