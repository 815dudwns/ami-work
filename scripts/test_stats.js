const { chromium } = require('/Users/woodelight/Projects/ami-work/worker/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  for (const sess of [
    { id:'user09', name:'윤용운', role:'user' },
    { id:'user01', name:'김민성', role:'user' },
    { id:'admin', name:'우영준', role:'admin' },
  ]) {
    const ctx = await b.newContext();
    const pg = await ctx.newPage();
    let alertMsg = '';
    pg.on('dialog', async d => { alertMsg = d.message(); await d.accept(); });
    await pg.addInitScript((s) => {
      localStorage.setItem('ami_auth', JSON.stringify(s));
      localStorage.setItem('ami_auth_version', '20260601a');
    }, sess);
    await pg.goto('http://localhost:8080/stats.html');
    await pg.waitForTimeout(1500);
    console.log(`${sess.id}: 최종URL=${pg.url().replace('http://localhost:8080/','')} alert="${alertMsg}"`);
    await ctx.close();
  }
  await b.close();
})();
