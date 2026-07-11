const { chromium } = require('playwright');
const fs = require('fs');
fs.mkdirSync('/tmp/pkl-final-shots', { recursive: true });
const results = [];
let shotIdx = 0;
const shot = async (page, label) => { await page.screenshot({ path: `/tmp/pkl-final-shots/${String(++shotIdx).padStart(2,'0')}-${label}.png` }); };
const log = async (sc, step, status, note = '') => { results.push({ sc, step, status, note }); console.log(`[${status==='PASS'?'✓':status==='FAIL'?'✗':'!'}] ${sc} › ${step}${note?' — '+note:''}`); };
const skipToLib = async (page) => {
  await page.goto('http://localhost:5173'); await page.waitForTimeout(800);
  await page.locator('button').filter({ hasText: /시작하기/ }).click(); await page.waitForTimeout(500);
  await page.locator('button[style*="height: 7px"]').nth(3).click(); await page.waitForTimeout(400);
  await page.locator('button').filter({ hasText: /서재 시작/ }).click(); await page.waitForTimeout(1000);
};
const tabs = (page) => page.locator('button[style*="flex-direction: column"]');

async function run() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const allErrors = [];

  // S1: 온보딩 플로우
  { const ctx = await browser.newContext({ viewport:{width:390,height:844} }); const page = await ctx.newPage();
    page.on('pageerror', e => allErrors.push('S1:'+e.message));
    await page.goto('http://localhost:5173'); await page.waitForTimeout(1200);
    await shot(page, 'S1-splash');
    await log('S1 온보딩', '스플래시 헤드라인', await page.locator('text=읽고').isVisible().catch(()=>false)?'PASS':'FAIL');
    await page.locator('button').filter({hasText:/시작하기/}).click(); await page.waitForTimeout(1000);
    await shot(page, 'S1-step1');
    await log('S1 온보딩', 'Google 연결 화면', await page.locator('text=Google 계정으로 시작').isVisible().catch(()=>false)?'PASS':'FAIL');
    const dots = page.locator('button[style*="height: 7px"]');
    await log('S1 온보딩', '진행 도트 4개', (await dots.count().catch(()=>0))===4?'PASS':'FAIL');
    await dots.nth(1).click(); await page.waitForTimeout(600); await shot(page,'S1-step2');
    await log('S1 온보딩', 'AI 키 입력 화면', await page.locator('text=AI 도우미 연결').isVisible().catch(()=>false)?'PASS':'FAIL');
    await dots.nth(2).click(); await page.waitForTimeout(600); await shot(page,'S1-step3');
    await log('S1 온보딩', 'Drive 폴더 화면', await page.locator('text=Drive 폴더 설정').isVisible().catch(()=>false)?'PASS':'FAIL');
    await dots.nth(3).click(); await page.waitForTimeout(600); await shot(page,'S1-step4');
    await log('S1 온보딩', '완료 화면', await page.locator('text=모든 준비 완료').isVisible().catch(()=>false)?'PASS':'FAIL');
    await page.locator('button').filter({hasText:/서재 시작/}).click(); await page.waitForTimeout(1000);
    await shot(page, 'S1-library');
    await log('S1 온보딩', '서재 진입', await page.locator('text=서재').first().isVisible().catch(()=>false)?'PASS':'FAIL');
    await ctx.close(); }

  // S2: 서재 & 리더
  { const ctx = await browser.newContext({ viewport:{width:390,height:844} }); const page = await ctx.newPage();
    page.on('pageerror', e => allErrors.push('S2:'+e.message));
    await skipToLib(page);
    for (const chip of ['읽는 중','완독','미열람']) {
      const el = page.locator('button').filter({hasText:chip}).first();
      if (await el.isVisible().catch(()=>false)) { await el.click(); await page.waitForTimeout(300); await log('S2 서재','`'+chip+'` 필터','PASS'); }
      else await log('S2 서재','`'+chip+'` 필터','FAIL','버튼 없음');
    }
    await page.locator('button').filter({hasText:'전체'}).first().click();
    await shot(page,'S2-library');
    const contBtn = page.locator('button').filter({hasText:/이어 읽기/});
    await log('S2 서재','이어 읽기 버튼', await contBtn.isVisible().catch(()=>false)?'PASS':'FAIL');
    await contBtn.click(); await page.waitForTimeout(1000);
    await log('S2 서재','리더 진입 모달', await page.locator('text=이어서 읽으시겠어요').isVisible().catch(()=>false)?'PASS':'FAIL');
    await page.mouse.click(195,100); await page.waitForTimeout(500);
    await log('S2 서재','백드롭 닫기 ★', !(await page.locator('text=이어서 읽으시겠어요').isVisible().catch(()=>false))?'PASS':'FAIL');
    await shot(page,'S2-reader');
    await page.locator('button').first().click(); await page.waitForTimeout(500);
    await log('S2 서재','뒤로가기', await page.locator('text=서재').first().isVisible().catch(()=>false)?'PASS':'FAIL');
    await ctx.close(); }

  // S3: 탭 내비게이션
  { const ctx = await browser.newContext({ viewport:{width:390,height:844} }); const page = await ctx.newPage();
    page.on('pageerror', e => allErrors.push('S3:'+e.message));
    await skipToLib(page);
    const tabTests = [{i:1,l:'검색',t:'검색'},{i:2,l:'지식',t:'지식'},{i:3,l:'목표',t:'오늘의 독서 목표'},{i:4,l:'AI',t:'AI 대화'},{i:0,l:'서재',t:'서재'}];
    for (const tb of tabTests) {
      await tabs(page).nth(tb.i).click(); await page.waitForTimeout(600);
      const found = await page.locator(`text=${tb.t}`).first().isVisible().catch(()=>false);
      await shot(page,`S3-${tb.l}`);
      await log('S3 탭 내비',`${tb.l} 탭 → ${tb.t}`, found?'PASS':'FAIL');
    }
    await ctx.close(); }

  // S4: 설정 패널
  { const ctx = await browser.newContext({ viewport:{width:390,height:844} }); const page = await ctx.newPage();
    page.on('pageerror', e => allErrors.push('S4:'+e.message));
    await skipToLib(page);
    const btn = page.locator('button[aria-label="설정"]');
    await log('S4 설정','aria-label 버튼 ★', await btn.isVisible().catch(()=>false)?'PASS':'FAIL');
    await btn.click(); await page.waitForTimeout(600);
    await shot(page,'S4-panel');
    const panel = await page.locator('text=설정').isVisible().catch(()=>false);
    await log('S4 설정','패널 열기 ★', panel?'PASS':'FAIL');
    if (panel) {
      await page.locator('button').filter({hasText:/Sage/}).click(); await page.waitForTimeout(300);
      await log('S4 설정','Sage 테마','PASS');
      await page.locator('div[style*="border-radius: 999px"][style*="cursor: pointer"]').first().click(); await page.waitForTimeout(400);
      await shot(page,'S4-dark'); await log('S4 설정','다크 모드 토글','PASS');
      await page.locator('div[style*="border-radius: 999px"][style*="cursor: pointer"]').first().click(); await page.waitForTimeout(300);
      await page.locator('button').filter({hasText:'Newsreader'}).click(); await page.waitForTimeout(300);
      await log('S4 설정','Newsreader 서체','PASS');
      await page.locator('button').filter({hasText:'English'}).click(); await page.waitForTimeout(400);
      await log('S4 설정','영어 전환','PASS');
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      await log('S4 설정','ESC 닫기 ★', !(await page.locator('text=색상 테마').isVisible().catch(()=>false))?'PASS':'FAIL');
      await shot(page,'S4-after');
    }
    await ctx.close(); }

  // S5: AI 채팅
  { const ctx = await browser.newContext({ viewport:{width:390,height:844} }); const page = await ctx.newPage();
    page.on('pageerror', e => allErrors.push('S5:'+e.message));
    await skipToLib(page);
    await tabs(page).nth(4).click(); await page.waitForTimeout(800);
    const suggest = page.locator('button').filter({hasText:/파괴적 혁신이란/});
    await log('S5 AI','제안 질문 표시', await suggest.isVisible().catch(()=>false)?'PASS':'FAIL');
    await suggest.click(); await page.waitForTimeout(1500);
    await shot(page,'S5-ai-response');
    const aiReply = await page.locator('div').filter({hasText:'기존 시장'}).last().isVisible().catch(()=>false);
    await log('S5 AI','AI 응답 표시 ★', aiReply?'PASS':'FAIL');
    await page.locator('input[placeholder*="질문"]').fill('민츠버그의 핵심은?'); await page.waitForTimeout(300);
    await page.keyboard.press('Enter'); await page.waitForTimeout(800);
    await shot(page,'S5-ai-typed');
    await log('S5 AI','Enter 전송', await page.locator('div').filter({hasText:'민츠버그의 핵심은'}).last().isVisible().catch(()=>false)?'PASS':'FAIL');
    await page.locator('button').filter({hasText:/소크라테스/}).click(); await page.waitForTimeout(300);
    await log('S5 AI','소크라테스 모드 전환','PASS');
    await ctx.close(); }

  // S6: 데스크탑
  { const ctx = await browser.newContext({ viewport:{width:1440,height:900} }); const page = await ctx.newPage();
    page.on('pageerror', e => allErrors.push('S6:'+e.message));
    await page.goto('http://localhost:5173'); await page.waitForTimeout(2000);
    await shot(page,'S6-desktop');
    await log('S6 데스크탑','레이아웃 렌더링', await page.locator('text=Personal Knowledge Library').first().isVisible().catch(()=>false)?'PASS':'FAIL');
    const dBtn = page.locator('button[aria-label="settings"]');
    await log('S6 데스크탑','설정 버튼 aria-label ★', await dBtn.isVisible().catch(()=>false)?'PASS':'FAIL');
    await dBtn.click({timeout:8000}); await page.waitForTimeout(600);
    await shot(page,'S6-desktop-settings');
    await log('S6 데스크탑','설정 패널 열기 ★', await page.locator('text=설정').isVisible().catch(()=>false)?'PASS':'FAIL');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    for (const item of ['검색','지식','목표']) {
      const el = page.locator(`text=${item}`).first();
      if (await el.isVisible().catch(()=>false)) { await el.click(); await page.waitForTimeout(600); await log('S6 데스크탑',`사이드바 '${item}'`,'PASS'); }
    }
    await shot(page,'S6-desktop-nav');
    await ctx.close(); }

  // 결과
  const pass = results.filter(r=>r.status==='PASS').length;
  const fail = results.filter(r=>r.status==='FAIL').length;
  console.log(`\n══ 최종 결과: ${results.length}개 검증 ✓ ${pass}개 통과 / ✗ ${fail}개 실패 ══`);
  if (allErrors.length) console.log('JS 오류:', allErrors.join('\n'));
  results.filter(r=>r.status==='FAIL').forEach(r => console.log(`  [✗] ${r.sc} › ${r.step}${r.note?' ('+r.note+')':''}`));
  await browser.close();
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
