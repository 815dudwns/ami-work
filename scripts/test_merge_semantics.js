#!/usr/bin/env node
/* test_merge_semantics.js — mergeOneAddress 의 계약 검사 (2026-09-09)
 *
 * 왜 있나: 서버에서 필드를 지웠는데(rework 414키 · previousComplete* 482필드) 폰에
 *   '재' 마커가 계속 떴다. 원인은 updatedAt 게이트 — 필드 삭제는 updatedAt 을 올리지
 *   않으므로 fbTime > localTime 이 false 가 되고, 폰이 로컬(옛 값)을 유지했다.
 *   전량 수신으로도 안 나았다. 같은 mergeOneAddress 를 타기 때문이다.
 *
 * 여기서 못박는 계약:
 *   - 서버가 비운 서버전용 필드(rework·previousComplete*)는 로컬에서도 비워진다
 *   - 단 한 방향이다 — 서버의 true 로 로컬 false 를 되살리지 않는다(업로드 중일 수 있다)
 *   - 전량 수신은 서버 권위다(게이트 무시). 단 미전송 주소는 덮지 않는다
 *   - meterChecks 는 언제나 ts union (남의 체크·내 미전송 체크 유실 금지)
 *
 * 실행: node scripts/test_merge_semantics.js   (저장소 루트에서)
 */
const fs=require('fs'), vm=require('vm'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','js','firebase.js'),'utf8');
const ctx={console:{log(){},warn(){}}, localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
           document:{addEventListener(){},getElementById:()=>null}, window:{addEventListener(){}},
           STORAGE_KEY:'ami_work_status', CHECKED_KEY:'ami_checked_meters', EVENTS_KEY:'ami_events',
           firebase:{apps:[],initializeApp(){},database(){}}, setTimeout, clearTimeout, Date, JSON};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const run = code => vm.runInContext(code, ctx);
const get = () => JSON.parse(run('JSON.stringify(workStatus)'));
let bad = 0;
const R=(name,ok)=>{ if(!ok) bad++; console.log((ok?'PASS':'FAIL')+' — '+name); };

const setup = (delta, pending, ws) => {
  run('_isDeltaMode = ' + JSON.stringify(delta));
  run('_pendingAddrs = new Set(' + JSON.stringify(pending) + ')');
  run('workStatus = ' + JSON.stringify(ws));
};
const merge = (addr, raw) => run('mergeOneAddress(' + JSON.stringify(addr) + ',' + JSON.stringify(raw) + ')');

// 1) 서버가 지운 값은 로컬에서도 지워진다 (updatedAt 동일 = 게이트에 막히는 경우)
setup(true, [], { A:{state:'complete',updatedAt:'2026-07-04T15:31:00+09:00',rework:true,
  previousCompleteAt:'2026-06-01T10:00:00+09:00',previousCompleteBy:'u2',previousCompleteByName:'이영길',
  meterChecks:{},checkedMeters:[]} });
merge('A',{state:'complete',updatedAt:'2026-07-04T15:31:00+09:00'});
let A = get().A;
R('서버가 지운 rework/previousComplete* 가 로컬에서 사라진다',
  A.rework===false && !A.previousCompleteAt && !A.previousCompleteBy && !A.previousCompleteByName);

// 2) 서버의 rework=true 가 로컬 false 를 되살리지 않는다 (방금 완료, 업로드 중)
setup(true, [], { B:{state:'complete',updatedAt:'2026-09-09T20:00:00+09:00',rework:false,meterChecks:{},checkedMeters:[]} });
merge('B',{state:'pending',updatedAt:'2026-07-04T15:31:00+09:00',rework:true});
R('서버 rework=true 가 로컬 false 를 되살리지 않는다', get().B.rework===false);

// 3) 로컬에 없던 주소는 서버 값을 그대로 받는다 (진짜 rework 는 정상 도착)
setup(true, [], {});
merge('C',{state:'pending',updatedAt:'2026-09-01T10:00:00+09:00',rework:true,previousCompleteAt:'2026-08-01T10:00:00+09:00'});
let C = get().C;
R('로컬에 없던 주소는 서버의 rework=true 를 그대로 받는다',
  C.rework===true && C.previousCompleteAt==='2026-08-01T10:00:00+09:00');

// 4) 서버가 더 최신이면 종전대로 서버 값 채택
setup(true, [], { D:{state:'pending',updatedAt:'2026-07-01T10:00:00+09:00',rework:false,meterChecks:{},checkedMeters:[]} });
merge('D',{state:'complete',updatedAt:'2026-09-09T10:00:00+09:00'});
R('서버가 더 최신이면 서버 상태 채택', get().D.state==='complete');

// 5) 내 미전송 체크가 유실되지 않는다 (union 유지) + rework 는 정리
setup(true, [], { E:{state:'pending',updatedAt:'2026-07-04T15:31:00+09:00',rework:true,
  meterChecks:{'m1':{checked:true,ts:999}},checkedMeters:['m1']} });
merge('E',{state:'pending',updatedAt:'2026-07-04T15:31:00+09:00',meterChecks:{'m2':{checked:true,ts:5}}});
let E = get().E;
R('미전송 체크 union 유지 + rework 정리',
  E.checkedMeters.includes('m1') && E.checkedMeters.includes('m2') && E.rework===false);

// 6) 전량 수신인데 미전송 주소면 서버가 덮지 않는다
setup(false, ['F'], { F:{state:'complete',updatedAt:'2026-09-09T21:00:00+09:00',rework:false,meterChecks:{},checkedMeters:[]} });
merge('F',{state:'pending',updatedAt:'2026-07-04T15:31:00+09:00'});
R('전량 수신이 미전송 주소를 덮지 않는다', get().F.state==='complete');

// 7) 전량 수신 + 미전송 아님 = 서버 권위 (PM 지시 경로)
setup(false, [], { G:{state:'complete',updatedAt:'2026-09-09T21:00:00+09:00',rework:true,meterChecks:{},checkedMeters:[]} });
merge('G',{state:'pending',updatedAt:'2026-07-04T15:31:00+09:00'});
let G = get().G;
R('전량 수신은 서버 권위(게이트 무시)', G.state==='pending' && G.rework===false);

console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
