const { chromium } = require('playwright');
const fs = require('fs');

fs.mkdirSync('/tmp/pkl-test-shots', { recursive: true });

const results = [];
let shotIndex = 0;

async function shot(page, label) {
  const path = `/tmp/pkl-test-shots/${String(++shotIndex).padStart(2,'0')}-${label}.png`;
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function log(scenario, step, status, note = '') {
  const entry = { scenario, step, status, note };
  results.push(entry);
  console.log(`[${status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '!'}] ${scenario} > ${step}${note ? ' — ' + note : ''}`);
}

async function runTests() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const errors = [];

  // ── SCENARIO 1: 첫 실행 & 온보딩 ─────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`S1: ${e.message}`));

    await page.goto('http://localhost:5173');
    await page.waitForTimeout(1500);
    await shot(page, 'S1-splash');

    // 1-1: 스플래시 로드
    const headline = await page.locator('text=읽고').isVisible().catch(() => false);
    await log('S1 첫 실행', '스플래시 헤드라인 표시', headline ? 'PASS' : 'FAIL');

    const startBtn = page.locator('button').filter({ hasText: /시작하기/ });
    const startVisible = await startBtn.isVisible().catch(() => false);
    await log('S1 첫 실행', '시작하기 버튼 존재', startVisible ? 'PASS' : 'FAIL');

    // 1-2: 온보딩 진입
    if (startVisible) {
      await startBtn.click();
      await page.waitForTimeout(1200);
      await shot(page, 'S1-onboarding-step1');
      const stepBar = await page.locator('text=Google').first().isVisible().catch(() => false);
      await log('S1 첫 실행', '온보딩 Step1 진입', stepBar ? 'PASS' : 'FAIL');
    }

    // 1-3: 스텝 도트로 단계 이동
    const dots = page.locator('button[style*="height: 7px"]');
    const dotCount = await dots.count().catch(() => 0);
    await log('S1 첫 실행', `스텝 도트 ${dotCount}개 존재`, dotCount === 4 ? 'PASS' : 'FAIL', `count=${dotCount}`);

    for (let i = 1; i < 4; i++) {
      await dots.nth(i).click();
      await page.waitForTimeout(700);
    }
    await shot(page, 'S1-onboarding-step4');
    const completeText = await page.locator('text=모든 준비 완료').isVisible().catch(() => false);
    await log('S1 첫 실행', '완료 화면 도달', completeText ? 'PASS' : 'FAIL');

    // 1-4: 서재 진입
    const finishBtn = page.locator('button').filter({ hasText: /서재 시작/ });
    if (await finishBtn.isVisible().catch(() => false)) {
      await finishBtn.click();
      await page.waitForTimeout(1500);
    }
    await shot(page, 'S1-library');
    const libraryTitle = await page.locator('text=서재').first().isVisible().catch(() => false);
    await log('S1 첫 실행', '서재 화면 도달', libraryTitle ? 'PASS' : 'FAIL');

    await ctx.close();
  }

  // ── SCENARIO 2: 서재 탐색 ────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`S2: ${e.message}`));

    // 온보딩 건너뛰고 바로 앱 상태로
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(1200);
    await page.locator('button').filter({ hasText: /시작하기/ }).click();
    await page.waitForTimeout(800);
    const dots = page.locator('button[style*="height: 7px"]');
    await dots.nth(3).click();
    await page.waitForTimeout(500);
    await page.locator('button').filter({ hasText: /서재 시작/ }).click();
    await page.waitForTimeout(1200);

    // 2-1: 필터 칩
    const filterChips = ['읽는 중', '완독', '미열람'];
    for (const chip of filterChips) {
      const chipEl = page.locator('button').filter({ hasText: chip }).first();
      const visible = await chipEl.isVisible().catch(() => false);
      if (visible) {
        await chipEl.click();
        await page.waitForTimeout(400);
        await log('S2 서재 탐색', `'${chip}' 필터 클릭`, 'PASS');
      } else {
        await log('S2 서재 탐색', `'${chip}' 필터 클릭`, 'FAIL', '버튼 없음');
      }
    }
    // 전체로 복귀
    await page.locator('button').filter({ hasText: '전체' }).first().click();
    await page.waitForTimeout(400);
    await shot(page, 'S2-library-filtered');

    // 2-2: 이어 읽기 버튼
    const continueBtn = page.locator('button').filter({ hasText: /이어 읽기/ });
    const contVisible = await continueBtn.isVisible().catch(() => false);
    await log('S2 서재 탐색', '이어 읽기 버튼 존재', contVisible ? 'PASS' : 'FAIL');

    // 2-3: 리더 화면 진입
    if (contVisible) {
      await continueBtn.click();
      await page.waitForTimeout(1500);
      await shot(page, 'S2-reader');
      const readerContent = await page.locator('text=전략의 본질').first().isVisible().catch(() => false);
      await log('S2 서재 탐색', '리더 화면 진입', readerContent ? 'PASS' : 'FAIL');
    }

    await ctx.close();
  }

  // ── SCENARIO 3: 탭 내비게이션 ───────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`S3: ${e.message}`));

    await page.goto('http://localhost:5173');
    await page.waitForTimeout(1000);
    await page.locator('button').filter({ hasText: /시작하기/ }).click();
    await page.waitForTimeout(600);
    const dots = page.locator('button[style*="height: 7px"]');
    await dots.nth(3).click();
    await page.waitForTimeout(400);
    await page.locator('button').filter({ hasText: /서재 시작/ }).click();
    await page.waitForTimeout(1000);

    const tabTests = [
      { idx: 1, label: '검색', expectedText: '검색' },
      { idx: 2, label: '지식', expectedText: '지식' },
      { idx: 3, label: '목표', expectedText: '오늘의 독서 목표' },
      { idx: 4, label: 'AI',  expectedText: 'AI 대화' },
      { idx: 0, label: '서재', expectedText: '서재' },
    ];

    const tabBtns = page.locator('div').filter({ has: page.locator('button[style*="flex-direction: column"]') }).first()
      .locator('button[style*="flex-direction: column"]');

    for (const t of tabTests) {
      const btn = tabBtns.nth(t.idx);
      const visible = await btn.isVisible().catch(() => false);
      if (visible) {
        await btn.click();
        await page.waitForTimeout(700);
        const found = await page.locator(`text=${t.expectedText}`).first().isVisible().catch(() => false);
        await shot(page, `S3-tab-${t.label}`);
        await log('S3 탭 내비게이션', `${t.label} 탭 → 화면 전환`, found ? 'PASS' : 'FAIL', found ? '' : `'${t.expectedText}' 텍스트 없음`);
      } else {
        await log('S3 탭 내비게이션', `${t.label} 탭`, 'FAIL', '탭 버튼 없음');
      }
    }

    await ctx.close();
  }

  // ── SCENARIO 4: 설정 패널 ───────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`S4: ${e.message}`));

    await page.goto('http://localhost:5173');
    await page.waitForTimeout(1000);
    await page.locator('button').filter({ hasText: /시작하기/ }).click();
    await page.waitForTimeout(600);
    const dots = page.locator('button[style*="height: 7px"]');
    await dots.nth(3).click();
    await page.waitForTimeout(400);
    await page.locator('button').filter({ hasText: /서재 시작/ }).click();
    await page.waitForTimeout(1000);

    // 설정 아이콘 클릭
    const settingsBtn = page.locator('button[style*="none"][style*="cursor: pointer"]').last();
    await settingsBtn.click().catch(async () => {
      // fallback: svg 포함한 버튼
      await page.locator('button').last().click();
    });
    await page.waitForTimeout(600);
    await shot(page, 'S4-settings-open');
    const settingsPanel = await page.locator('text=설정').isVisible().catch(() => false);
    await log('S4 설정', '설정 패널 열기', settingsPanel ? 'PASS' : 'FAIL');

    if (settingsPanel) {
      // 테마 변경: Sage
      const sageBtn = page.locator('button').filter({ hasText: /Sage/ });
      if (await sageBtn.isVisible().catch(() => false)) {
        await sageBtn.click();
        await page.waitForTimeout(400);
        await log('S4 설정', 'Sage 테마 선택', 'PASS');
      }

      // 다크모드 토글
      const darkToggle = page.locator('div[style*="border-radius: 999px"][style*="cursor: pointer"]').first();
      if (await darkToggle.isVisible().catch(() => false)) {
        await darkToggle.click();
        await page.waitForTimeout(400);
        await shot(page, 'S4-settings-dark');
        await log('S4 설정', '다크 모드 토글', 'PASS');
        await darkToggle.click(); // 원복
        await page.waitForTimeout(300);
      }

      // 서체 변경: Newsreader
      const newsBtn = page.locator('button').filter({ hasText: /Newsreader/ });
      if (await newsBtn.isVisible().catch(() => false)) {
        await newsBtn.click();
        await page.waitForTimeout(300);
        await log('S4 설정', 'Newsreader 서체 선택', 'PASS');
      }

      // 언어 변경: English
      const enBtn = page.locator('button').filter({ hasText: 'English' });
      if (await enBtn.isVisible().catch(() => false)) {
        await enBtn.click();
        await page.waitForTimeout(400);
        await shot(page, 'S4-settings-english');
        await log('S4 설정', '영어 전환', 'PASS');
      }

      // 닫기
      const closeBtn = page.locator('button').filter({ hasText: '' }).filter({ has: page.locator('svg') }).first();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    await ctx.close();
  }

  // ── SCENARIO 5: 데스크탑 레이아웃 (1440px) ──────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`S5: ${e.message}`));

    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);
    await shot(page, 'S5-desktop');
    const sidebar = await page.locator('text=Personal Knowledge Library').first().isVisible().catch(() => false);
    await log('S5 데스크탑', '데스크탑 레이아웃 렌더링', sidebar ? 'PASS' : 'FAIL');

    // 사이드바 메뉴 항목 확인
    const sidebarItems = ['서재', '검색', '지식', '목표'];
    for (const item of sidebarItems) {
      const found = await page.locator(`text=${item}`).first().isVisible().catch(() => false);
      await log('S5 데스크탑', `사이드바 '${item}' 메뉴`, found ? 'PASS' : 'WARN', found ? '' : '미표시');
    }

    await shot(page, 'S5-desktop-full');
    await ctx.close();
  }

  // ── 결과 요약 ───────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  console.log(`총 ${results.length}개 검증: ✓ ${pass}개 통과  ✗ ${fail}개 실패  ! ${warn}개 경고`);
  if (errors.length) console.log('\nJS 오류:\n' + errors.join('\n'));
  console.log('══════════════════════════════════════════\n');

  const failList = results.filter(r => r.status !== 'PASS');
  if (failList.length) {
    console.log('개선 필요 항목:');
    failList.forEach(r => console.log(`  [${r.status}] ${r.scenario} > ${r.step}${r.note ? ' (' + r.note + ')' : ''}`));
  }

  await browser.close();
  return results;
}

runTests().catch(e => { console.error('TEST RUNNER ERROR:', e.message); process.exit(1); });
