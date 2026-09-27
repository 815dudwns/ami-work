const { chromium } = require('/Users/woodelight/Projects/ami-work/worker/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 300 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  await pg.addInitScript(() => {
    localStorage.setItem('ami_auth', JSON.stringify({ id: 'user09', name: '윤용운', role: 'user' }));
    localStorage.setItem('ami_auth_version', '20260601a');
  });
  await pg.goto('http://localhost:8080/map.html');
  await pg.waitForTimeout(2000);
  // 헤더(상단 바)만 클립
  await pg.screenshot({ path: '/Users/woodelight/Desktop/검증_user09_헤더.png', clip: { x: 500, y: 0, width: 700, height: 55 } });
  await b.close();
  console.log('saved');
})();
