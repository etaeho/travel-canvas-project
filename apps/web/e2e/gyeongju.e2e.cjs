// 경주 장면을 처음부터 끝까지 누른다. 실행: npm run test:e2e (먼저 빌드한다)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, '__screens__');
const PORT = 4173;
const URL = `http://localhost:${PORT}/`;
const GALBI = 'gj-yeongyang-sutbul-galbi';

let server;
let browser;

async function waitForServer(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(URL);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`vite preview did not start on ${URL}`);
}

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  }
}

before(async () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'dist', 'index.html')), 'dist가 없다. 먼저 npm run build를 돌린다.');
  fs.mkdirSync(SHOTS, { recursive: true });
  const viteBin = path.join(path.dirname(require.resolve('vite/package.json', { paths: [ROOT] })), 'bin', 'vite.js');
  server = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  await waitForServer(15000);
  browser = await launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
});

const noOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const totals = async (page) => ({
  walk: await page.getByTestId('total-walk').innerText(),
  drive: await page.getByTestId('total-drive').innerText(),
  cost: await page.getByTestId('total-cost').innerText(),
});

/** Prefs → trip → picks → itinerary, with the default answers. */
async function answerQuestions(page) {
  await page.getByRole('heading', { name: '어떤 여행을 좋아하나요?' }).waitFor();
  await page.getByRole('button', { name: '저장하고 다음' }).click();
  await page.getByRole('heading', { name: '어디로, 언제, 누구와?' }).waitFor();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('heading', { name: '꼭 가고 싶은 곳이 있나요?' }).waitFor();
  await page.getByRole('button', { name: '일정 만들기' }).click();
  await page.getByRole('tab', { name: '일정' }).waitFor();
}

test('경주 장면: 질문부터 일정표, 대안 바꾸기, 숙소와 경비까지', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
  const page = await context.newPage();
  const errors = [];
  const outside = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('request', (r) => !r.url().startsWith(URL) && !r.url().startsWith('data:') && outside.push(r.url()));

  await page.goto(URL);

  // 1. 취향: 처음에만 나온다. 기본값은 가족이 정한 값이다.
  await page.getByRole('heading', { name: '어떤 여행을 좋아하나요?' }).waitFor();
  assert.equal(await page.locator('#pref-walk').inputValue(), '10');
  assert.equal(await page.locator('#pref-wait').inputValue(), '20');
  assert.ok(await noOverflow(page), '취향 화면이 390px에서 가로로 넘친다');
  await page.getByRole('button', { name: '저장하고 다음' }).click();

  // 2. 여행 조건: 경주 가족 여행이 기본값이다.
  await page.getByRole('heading', { name: '어디로, 언제, 누구와?' }).waitFor();
  assert.equal(await page.locator('#trip-start').inputValue(), '2026-12-05');
  assert.equal(await page.locator('#trip-end').inputValue(), '2026-12-06');
  assert.equal(await page.locator('#trip-count').inputValue(), '5');
  assert.equal(await page.locator('#trip-arrive').inputValue(), '16:30');
  assert.ok(await noOverflow(page), '여행 조건 화면이 390px에서 가로로 넘친다');
  await page.getByRole('button', { name: '다음', exact: true }).click();

  // 3. 꼭 갈 곳: 저녁이 시간과 함께 들어 있다. 이번만 다른 것에는 표시가 붙는다.
  await page.getByRole('heading', { name: '꼭 가고 싶은 곳이 있나요?' }).waitFor();
  const picked = page.getByTestId('picked');
  assert.equal(await picked.count(), 1);
  assert.match(await picked.first().innerText(), /영양숯불갈비/);
  assert.equal(await page.locator(`[id="fix-${GALBI}-start"]`).inputValue(), '18:00');
  await page.locator('#place-search').fill('박물관');
  assert.equal(await page.locator('.placebtn').count(), 1);
  await page.locator('#place-search').fill('');
  const wait = page.getByTestId('override-maxWaitMin');
  assert.equal(await wait.getByText('이번만', { exact: true }).count(), 0);
  await wait.getByRole('checkbox').check();
  await wait.locator('select').selectOption('40');
  assert.equal(await wait.getByText('이번만', { exact: true }).count(), 1);
  assert.match(await wait.innerText(), /40분까지/);
  assert.ok(await noOverflow(page), '꼭 갈 곳 화면이 390px에서 가로로 넘친다');
  await page.getByRole('button', { name: '일정 만들기' }).click();

  // 4. 일정표: 저녁은 12월 5일 18:00에 있고 시간이 고정이다.
  await page.getByRole('tab', { name: '일정' }).waitFor();
  assert.match(await page.locator('.planhead').innerText(), /경주 가족 여행/);
  assert.match(await page.locator('.planhead').innerText(), /5명 · 어르신 동행/);
  const day1 = page.locator('[data-testid="day"][data-date="2026-12-05"]');
  assert.match(await day1.locator('.dayhead').innerText(), /12월 5일\(토\)/);
  const dinner = day1.locator(`[data-testid="item"][data-place="${GALBI}"]`);
  assert.equal(await dinner.count(), 1, '영양숯불갈비가 12월 5일에 없다');
  assert.match(await dinner.locator('time').innerText(), /^18:00/);
  assert.match(await dinner.innerText(), /영양숯불갈비/);
  assert.match(await dinner.innerText(), /시간 고정/);
  assert.equal(await dinner.getByTestId('alt-toggle').count(), 0, '시간을 정한 곳에 대안 버튼이 있다');
  assert.match(await day1.locator('.sumbox').innerText(), /12월 5일/);

  // 확인하지 않은 곳을 확인됨으로 적지 않는다. 경주 데이터에는 확인됨이 없다.
  assert.equal(await page.locator('.tag', { hasText: /^확인됨$/ }).count(), 0);
  assert.ok((await page.locator('.tag', { hasText: /^일부 확인$/ }).count()) > 0);
  assert.ok((await page.getByTestId('warnings').locator('li').count()) > 0);
  assert.match(await page.getByTestId('unknowns').innerText(), /모르는 값 \d+곳/);

  assert.ok(await noOverflow(page), '일정표가 390px에서 가로로 넘친다');
  await page.screenshot({ path: path.join(SHOTS, 'itinerary-390.png'), fullPage: true });

  // 대안: 합계가 달라지는 대안을 찾아 바꾼다.
  const toggles = page.getByTestId('alt-toggle');
  const toggleCount = await toggles.count();
  assert.ok(toggleCount > 0, '대안이 있는 항목이 하나도 없다');
  let chosen = null;
  for (let i = 0; i < toggleCount && !chosen; i += 1) {
    await toggles.nth(i).click();
    const alts = page.getByTestId('alt');
    for (let j = 0; j < (await alts.count()); j += 1) {
      const delta = await alts.nth(j).getByTestId('alt-delta').innerText();
      if (delta !== '이동과 경비는 그대로') {
        chosen = { alt: alts.nth(j), toggle: toggles.nth(i), delta };
        break;
      }
    }
  }
  assert.ok(chosen, '이동이나 경비가 달라지는 대안이 없다');
  assert.equal(await chosen.toggle.getAttribute('aria-expanded'), 'true');
  assert.ok((await chosen.alt.locator('p').innerText()).length > 0, '대안에 이유가 없다');
  await chosen.toggle.scrollIntoViewIfNeeded();
  assert.ok(await noOverflow(page), '대안을 편 화면이 390px에서 가로로 넘친다');
  await page.screenshot({ path: path.join(SHOTS, 'alternatives-390.png') });

  const beforeSwap = await totals(page);
  const altName = await chosen.alt.locator('b').innerText();
  const altPlace = await chosen.alt.getAttribute('data-place');
  await chosen.alt.getByRole('button', { name: /바꾸기/ }).click();
  const afterSwap = await totals(page);
  assert.notDeepEqual(afterSwap, beforeSwap, `바꿨는데 합계가 그대로다 (${chosen.delta})`);
  assert.equal(await page.locator(`[data-testid="item"][data-place="${altPlace}"]`).count(), 1);
  assert.match(await page.getByTestId('notice').innerText(), new RegExp(altName));
  assert.equal(await dinner.locator('time').innerText().then((t) => t.slice(0, 5)), '18:00');

  // 5. 자세히: 주소, 확인 상태, 새 창으로 여는 출처.
  await dinner.getByRole('button', { name: /영양숯불갈비 자세히 보기/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.waitFor();
  assert.match(await sheet.innerText(), /경상북도 경주시 봉황로 79/);
  assert.match(await sheet.innerText(), /일부 확인/);
  assert.match(await sheet.innerText(), /값 모름/);
  const link = sheet.locator('.sources a').first();
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.match(await link.getAttribute('rel'), /noopener/);
  assert.ok(await noOverflow(page), '자세히 화면이 390px에서 가로로 넘친다');
  await sheet.getByRole('button', { name: '닫기' }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);

  // 숙소: 고르면 일정을 다시 짠다.
  await page.getByRole('tab', { name: '숙소' }).click();
  const stays = page.getByTestId('stay');
  assert.equal(await stays.count(), 3);
  assert.match(await stays.first().innerText(), /값 모름/);
  assert.ok(await noOverflow(page), '숙소 탭이 390px에서 가로로 넘친다');
  const hanok = page.locator('[data-testid="stay"][data-place="gj-hwangnamgwan"]');
  await hanok.getByRole('button', { name: '이 숙소로' }).click();
  assert.match(await page.locator('.planhead').innerText(), /숙소 · 황남관 한옥마을/);
  assert.equal(await hanok.getByRole('button', { name: /선택됨/ }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('tab', { name: '일정' }).click();
  assert.ok((await page.locator('[data-testid="item"][data-place="gj-hwangnamgwan"]').count()) >= 1);
  assert.equal(await page.locator(`[data-date="2026-12-05"] [data-place="${GALBI}"] time`).innerText().then((t) => t.slice(0, 5)), '18:00');

  // 경비: 종류별 합계, 모르는 값, 예산.
  await page.getByRole('tab', { name: '경비' }).click();
  assert.equal(await page.getByTestId('cost-total').innerText(), (await totals(page)).cost);
  assert.match(await page.getByTestId('cost-unknown').innerText(), /값을 모르는 곳 \d+곳/);
  assert.ok((await page.getByTestId('cost-row').count()) > 0);
  assert.match(await page.getByTestId('budget-line').innerText(), /예산을 넣지 않아/);
  assert.ok(await noOverflow(page), '경비 탭이 390px에서 가로로 넘친다');

  // 조건으로 돌아가도 넣은 값이 남는다. 예산을 넣으면 견준다.
  await page.getByRole('button', { name: '조건 고치기' }).click();
  await page.getByRole('heading', { name: '어디로, 언제, 누구와?' }).waitFor();
  assert.equal(await page.locator('#trip-count').inputValue(), '5');
  await page.locator('#trip-budget').fill('10');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  assert.equal(await page.getByTestId('picked').count(), 1);
  assert.equal(await page.getByTestId('override-maxWaitMin').getByText('이번만', { exact: true }).count(), 1);
  await page.getByRole('button', { name: '일정 만들기' }).click();
  await page.getByRole('tab', { name: '경비' }).click();
  assert.match(await page.getByTestId('budget-line').innerText(), /예산 100,000원/);

  // 다시 열면 취향은 묻지 않는다. 지난 조건이 남아 있다.
  await page.reload();
  await page.getByRole('heading', { name: '어디로, 언제, 누구와?' }).waitFor();
  assert.equal(await page.locator('#trip-budget').inputValue(), '10');

  assert.deepEqual(outside, [], '밖으로 나간 요청이 있다');
  assert.deepEqual(errors, [], '브라우저 오류가 있다');
  await context.close();
});

test('1280px에서도 가로로 넘치지 않는다', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
  const page = await context.newPage();
  await page.goto(URL);
  assert.ok(await noOverflow(page), '취향 화면이 1280px에서 가로로 넘친다');
  await answerQuestions(page);
  assert.ok(await noOverflow(page), '일정 탭이 1280px에서 가로로 넘친다');
  await page.getByTestId('alt-toggle').first().click();
  assert.ok(await noOverflow(page), '대안을 편 화면이 1280px에서 가로로 넘친다');
  await page.getByRole('tab', { name: '숙소' }).click();
  assert.ok(await noOverflow(page), '숙소 탭이 1280px에서 가로로 넘친다');
  await page.getByRole('tab', { name: '경비' }).click();
  assert.ok(await noOverflow(page), '경비 탭이 1280px에서 가로로 넘친다');
  await context.close();
});

test('누르는 곳은 44px보다 작지 않다 (390px)', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
  const page = await context.newPage();
  await page.goto(URL);
  const small = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('button, select, input:not([type="checkbox"]), summary, a[href]')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 44)
        .map(({ el, r }) => `${el.tagName} "${(el.textContent || el.id || '').trim().slice(0, 20)}" ${Math.round(r.height)}px`),
    );
  assert.deepEqual(await small(), []);
  await answerQuestions(page);
  await page.getByTestId('alt-toggle').first().click();
  assert.deepEqual(await small(), []);
  await page.getByRole('tab', { name: '숙소' }).click();
  assert.deepEqual(await small(), []);
  await context.close();
});
