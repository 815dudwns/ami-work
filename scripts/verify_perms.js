const { chromium } = require('/Users/woodelight/Projects/ami-work/worker/node_modules/playwright');

const AUTH_VERSION = '20260601a';
const ROLES = {
  admin:  { id: 'admin',  name: '우영준', role: 'admin' },
  user09: { id: 'user09', name: '윤용운', role: 'user' },
  user01: { id: 'user01', name: '김민성', role: 'user' },
};

(async () => {
  const b = await chromium.launch();
  const rows = [];
  for (const [k, sess] of Object.entries(ROLES)) {
    const ctx = await b.newContext();
    const pg = await ctx.newPage();
    await pg.addInitScript(([s, v]) => {
      localStorage.setItem('ami_auth', JSON.stringify(s));
      localStorage.setItem('ami_auth_version', v);
    }, [sess, AUTH_VERSION]);
    await pg.goto('http://localhost:8080/map.html');
    await pg.waitForTimeout(2000);
    const vis = async (sel) => {
      try { return await pg.$eval(sel, e => getComputedStyle(e).display !== 'none'); }
      catch (e) { return 'NA'; }
    };
    const r = {
      role: k,
      url: pg.url().replace('http://localhost:8080/', ''),
      통계: await vis('#stats-btn'),
      사진등록: await vis('#admin-upload-btn'),
      계기추가: await vis('#add-meter-btn'),
      관리자메뉴: await vis('#admin-btn'),
    };
    rows.push(r);
    await ctx.close();
  }
  await b.close();
  console.log(JSON.stringify(rows, null, 2));
})();
