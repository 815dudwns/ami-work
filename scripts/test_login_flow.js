const { chromium } = require('/Users/woodelight/Projects/ami-work/worker/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();  // 캐시·localStorage 깨끗
  const pg = await ctx.newPage();
  const trail = [];
  pg.on('framenavigated', f => { if (f === pg.mainFrame()) trail.push(f.url().replace('http://localhost:8080/','')); });
  await pg.goto('http://localhost:8080/login.html');
  await pg.waitForTimeout(800);
  console.log('1) 초기 도착:', pg.url().replace('http://localhost:8080/',''));
  // 로그인 폼 입력 (user09)
  await pg.fill('#input-id', 'user09');
  await pg.fill('#input-pw', '1111');
  await pg.click('#login-btn').catch(async()=>{ await pg.evaluate(()=>handleLogin(new Event('submit'))); });
  await pg.waitForTimeout(2000);
  console.log('2) 로그인 후 도착:', pg.url().replace('http://localhost:8080/',''));
  console.log('3) localStorage:', await pg.evaluate(()=>({ auth: localStorage.getItem('ami_auth'), ver: localStorage.getItem('ami_auth_version') })));
  console.log('4) 네비 추적:', trail.join(' -> '));
  await b.close();
})();
