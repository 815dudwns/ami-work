// awms-bridge 리모컨 — QRCODE/BARCODE 클릭 → 네이티브 구글 스캐너(ML Kit) → 검증 parseValue로 추출 → 타겟 칸 입력.
// 타겟 칸 = awms Vue(__vue__)의 vFlmnCl (modalOpen('FIELD')가 세팅).
//   - 모뎀맥/맥 계열(MAC/MODEM) → parseValue.value 를 012+끝8 변환
//   - 계기번호/대표계기(INSTR_NUM/METER_ID), DCU_ID → parseValue.value 그대로
// parseValue = ami-work/js/awms-parseValue.js (awms 원본 검증본) 인라인. OCR은 awms 원본.

(function () {
  'use strict';
  var VER = 'v102'; // v102: 테스터 전용 — 자재 현황 화면 [작업 검사]: 그날 내 awms 등록을 맥 작업검사(cst_daily_check)와 같은 규칙으로 판정(빨강 할 일·노랑·초록, 사진 판독·지도 완료 없음, 뒷자리 2자리 중복·같은 주소 리스트 계기로 번호 1자리 차이·누락 후보, 모뎀 사용·일별 작업 현황), awms 읽기만. v101: 헬퍼 첫 화면 [자재 현황](앱 1.0.82~) — 앱이 남긴 표시가 있으면 로그인 뒤 자재 현황을 바로 엶. v100: 자재 현황 전 작업자 공개(로그인 아이디만 있으면 — 기록은 각자 helperStock/<USER_ID>). v99: 로그인 진단 — POST /login 응답(상태·success·이동 주소·오류 코드, 값·계정은 안 실음)과 OTP 자동 입력 시각을 Firebase 로그에 남김(간헐 '로그인 화면으로 되돌아감' 원인 확인용) · 네이티브에 OTP 가 없는 빌드(__otpNative=false)면 OTP 요청 표시 없음. v98: 사진 크게 보기(전 작업자 · 헬퍼만) — awms 사진 칸이 새 창(window.open·<a target=_blank>)으로 여는 사진을 같은 화면 위에 띄움, 닫기·이전/다음(지금 행 1 작업전·2 모뎀맥·3 계기·4 집합)·두 손가락 확대·두 번 톡 2배·옆으로 밀기, 저장 흐름 무관 · v96 리스트 지사 안내('리스트 지사 X — 지금 Y' + [X 로 바꾸기]) 전 작업자 공개(__featOn, 자재 현황은 테스터 그대로) · 맥 형식 검사(macFormatError) 사유와 [맥 오류] 상자 제안 줄('한 글자 차이 — X 여부 라벨 재확인 필요')을 명사형으로 — 설비등록 [맥 오류] 상자(전 작업자)와 자재 현황 화면이 같은 문구(허용 외 문자·LTE MAC 자릿수·자릿수 부족/초과·미사용 앞자리·847207 7번째 자리). v97: 테스터 전용 자재 현황 화면(코드명 자재관리, 화면 문구 업무체 — 재고·사용 완료·별도 관리 자재·자재 등록) — 헬퍼 홈 [자재 현황] 버튼. 내 모뎀(출고 20·인계 40, 본인 인계·6/22 이전 출고·소유 N·교체로 뗀 옛 모뎀 뺌) - 시공 목록 맥 = 보유/사용, 종류는 my_stock.kind() 와 같은 규칙(E 추정 없음, 전부 AE), 종류별 보유 awms·따로장부·합계·오늘 사용 표, 자재 추가 = [스캔] 한 번에 한 개(카메라 저절로 닫힘) 대기 목록에 쌓고 들어올 때 검사(형식·종류·내 출고/인계·awms 자재 []·따로장부·목록 중복, 거절 줄은 이유 표시·저장 안 함), [저장] 한 번 PATCH 로 Firebase helperStock/<USER_ID>/offbook/<MAC> 에 기록(awms 에 들어오면 'awms 에 들어옴' 표시, 한 번만 셈). awms 는 읽기만(selectList·selectBarcdQr·getMainList). v96: 계기번호(마스터) 입력 순간 그 계기가 든 지도 리스트 행의 지사와 지금 행 지사(DEPT2)가 다르면 안내 + [X 로 바꾸기] 버튼(누르면 v88 과 같이 currentRow.DEPT2 만 바꿈). 저장된 행(REG_DATE)·슬레이브(MODEM_DIV 20)는 안 띄움. 지사 표 = data/meter-jisa-index.json(라벨 인덱스와 같은 행, DEPT2 묶음). 테스터 전용(__isTester). v95: 설치불가/철거관리(MOBCST2000) — 처음 열 때 모뎀 선택, 목록 지사·임의추가 새 행 지사를 헬퍼 설정 지사로(awms 작업자 세팅 서대문은평 대신, 저장 body DEPT2·vKdnDept 같이 따라감). 대상리스트 행·슬레이브·저장된 행은 그대로. 게이트 __featOn. v94: OTP 요청 마킹 — Enter 키 로그인(keydown) + POST /login 요청(XHR) 시에도 표시(버튼 click 만 보던 구멍, 카톡 OTP 캡쳐 스킵 원인). v93: 계기 리스트 라벨에 선조치 + 새 리스트 이름은 인덱스(__names)에서 읽음(코드 수정 없이 따라옴). v92: 계기 리스트 라벨을 캐시에 고정하지 않고 매번 최신 확인(합동 업로드 후 안 따라오던 문제). v91: AC5E8C 모뎀 통신방식 자동 = k-dcu(90). v90: 12자리 PLC 맥도 내 자재 조회. v89: v86~v88 검사 전 작업자 공개(__featOn). v88: 새 행 지사·동행 헬퍼 설정값 강제 · 25미청구 비고 25. v87: 테스터 전용 입력 검사 — 계기번호(11자리 형식·지도 리스트 소속)·모뎀맥 내 자재 여부 라벨 + 지사 설정값 우선(헬퍼 설정 > 마지막 저장값). v86: 테스터(영준님 계정) 전용 기능 게이트 __isTester + 키보드에 가린 아래쪽 칸(비고 등) 끌어올리기. v85: 맥 오류 검사 — 글자(0-9·A-F)·자릿수(hex12/012+8)·앞6자리 5개(847207은 7번째 0BCDE)를 어기면 [맥 오류] 박스. 손입력 중엔 조용(자릿수 차야 판정), 스캔은 즉시 판정. 자동 재스캔 없음(v82 무한루프 재발 방지). v84: BARCODE intercept 제거 → awms 원래 바코드 스캐너 그대로(우리 구글스캐너 바코드 오독 다발로 원복). QRCODE만 우리 스캐너 유지. v83: BARCODE 1D전용 scanBarcode 원복(잘못된 방향 — 여전히 우리 스캐너). v82: 바코드/큐알 둘다 구글스캐너(scan) 통일 — 1D전용·12자리검증/재시도 폐기(무한루프 유발). v81: BARCODE 1D전용 scanBarcode(폐기). v80: 847207 통신방식 정밀화 — 7번째0 속 8472070E3·E4·D9는 ks-plc(10)로 분기(나머지 0/E=k-dcu, B/C/D=ks-plc). v79: 헬퍼 ⌂(홈) 버튼 = awms 안떠나고 홈 오버레이(돌아가기=재로딩0). AndroidNav 게이트(헬퍼전용). v78: OTP 마킹 if(f) 밖으로 — 인증번호 재발송(password칸 없는)화면서 마킹 누락→캡쳐스킵 버그 수정. v77: OTP 겹침방지 __markOtpReq(OTP발송버튼 클릭→자기앱 로컬플래그). v76: __otpReceived 직접경로(헬퍼내장) + 로그인버튼 btn-login 수정
  var FEAT_RELEASED = true;   // [v89] released input checks on for every helper user (see __featOn)

  // firebase RTDB — helper는 AndroidRecorder 없어 logcat 안 남음.
  // RTDB는 awms.kdn.com CORS 열림(확인됨). 시공전 디버깅용. 사용자 소수 + 무한 배포 전제.
  // [로그분리] 같은 inject를 helper(통신팀)·awms-queue(계기팀)가 둘 다 로드 → 로그 겹쳐 혼선.
  //   awms-queue 앱 awms웹뷰엔 window.AwmsResult 브릿지 주입됨(helper엔 없음) → 그걸로 노드 분기.
  //   awms-queue → awmslog/queue (app.js 로그와 동일 노드) / helper → awmslog/helper.
  var _FB_BASE = 'https://ami-jongno-default-rtdb.asia-southeast1.firebasedatabase.app/awmslog/';
  function _logNode() { return (window.AwmsResult || window.AwmsQ) ? 'queue' : 'helper'; }
  var _FBLOG = _FB_BASE + _logNode() + '.json';
  // [v61] firebase 로그 화이트리스트 — 핵심만 보냄(진단 폭주 차단). 디버깅 필요시 window.__FBLOG_ALL=true 로 전체.
  var _FBLOG_KEEP = { 'login-res': 1, 'otp-native-direct': 1, 'photo-view': 1, 'photo-probe': 1, 'photo-view-err': 1, 'master-photo-saved': 1, 'slave-photo-copy': 1, 'boot': 1, 'slave-a3-inject': 1, 'addrow-life': 1, 'a4-clear': 1, 'addrow-hook-on': 1, 'mb-to-meter': 1, 'otp-baseline': 1, 'otp-autofill': 1, 'otp-autofill-fail': 1, 'dept-diag': 1, 'dept-force': 1, 'etc25-auto': 1, 'etc25-clear': 1, 'jisa-change': 1 };
  function rec(o) {
    try {
      o.kind = 'cam'; o.ts = Date.now(); o.url = 'https://awms.kdn.com/__cam__/' + (o.stage || '');
      if (window.AndroidRecorder && window.AndroidRecorder.record) window.AndroidRecorder.record(JSON.stringify(o));
    } catch (e) {}
    try {
      if (!window.__FBLOG_ALL && !_FBLOG_KEEP[o.stage]) return; // 진단 stage는 firebase 안 보냄(폭주 차단)
      fetch(_FB_BASE + _logNode() + '.json', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ s: o.stage || '', d: o, iso: new Date().toISOString(), ver: VER, ph: (function(){try{return _phoneId();}catch(e){return '';}})() }) }).catch(function () {});
    } catch (e) {}
  }

  // [v50] 버전 배지 — 화면 우측 상단에 현재 inject 버전 표시 (최신 수신 확인용) + boot 로그
  function _verBadge() {
    try {
      var b = document.getElementById('__injver');
      if (!b) {
        b = document.createElement('div'); b.id = '__injver';
        b.style.cssText = 'position:fixed;right:2px;top:2px;z-index:2147483647;background:#1e3a8a;color:#fff;font:11px monospace;padding:2px 6px;border-radius:4px;opacity:.9;pointer-events:none';
        (document.body || document.documentElement).appendChild(b);
      }
      b.textContent = 'inj ' + VER;
    } catch (e) {}
  }
  try { rec({ stage: 'boot' }); _verBadge(); setTimeout(_verBadge, 1500); setTimeout(_verBadge, 4000); } catch (e) {}

  function closeFlmnModal() {
    try {
      var modal = document.getElementById('flmnMode');
      if (!modal) return;
      rec({ stage: 'close-modal' });
      ['.layer_close', '.cbtn', '[title*="닫기"]'].some(function (s) {
        var b = modal.querySelector(s);
        if (b) { b.click(); return true; }
        return false;
      });
    } catch (e) {}
  }

  function getAwmsVM() {
    try {
      var all = document.querySelectorAll('body *');
      for (var i = 0; i < all.length; i++) {
        var v = all[i].__vue__;
        if (!v) continue;
        var q = [v.$root || v], seen = 0;
        while (q.length && seen < 800) {
          var c = q.shift(); seen++;
          if (c && c.mainList && ('vFlmnCl' in c)) return c;
          if (c && c.$children) for (var j = 0; j < c.$children.length; j++) q.push(c.$children[j]);
        }
      }
    } catch (e) {}
    return null;
  }

  // 모뎀맥 변환: LTE(자재ID G1S3 / 012숫자)만 012+끝8. PLC hex MAC(847207D… 등)은 원본 유지.
  function modemTo012(v) {
    var s = String(v || '').trim();
    if (/^012\d{8}$/.test(s)) return s;                              // 이미 LTE 스캔값
    var d = s.replace(/\D/g, '');
    if (/^012\d{8}$/.test(d)) return d;
    if (/G1S3/i.test(s) && d.length >= 8) return '012' + d.slice(-8); // LTE 자재ID(G1S3) → 012+끝8
    return s;                                                         // PLC hex MAC 등 = 원본 그대로
  }

  // ===== awms 검증 parseValue (js/awms-parseValue.js 인라인) =====
function parseValue(text) {
            function lpad(text, padString, length) {
                let temp = "";
                for(let i = 0; i < length; i++) {
                    temp += "" + padString;
                }
                temp += text;
                return temp.substring(temp.length - 6, temp.length);
            }
            let parsedText = "";
			let parsedText2 = "";
			text = text.split("\x00").join("");
            if(text.split(" ").join("").length == 13) {
                // ★접두 문자를 특정하지 않는다. 계기타입은 3~4번째 자리로 판정하므로
                //   앞에 무엇이 붙든(A·LA 등) 상관없다. 길이 11 + 영숫자면 통과시킨다.
                var exp = /^\*[0-9A-Za-z]{11}\*$/;
                var clearedText = text.split(" ").join("");
                if(exp.test(clearedText)) {
                    parsedText = clearedText.split("*").join("").toUpperCase();
                }
            }
            else if(text.split(" ").join("").length == 11) {
                // ★같은 이유로 숫자만 요구하지 않는다. 순수 숫자 11자리도 그대로 통과한다.
                var exp = /^[0-9A-Za-z]{11}$/;
                var clearedText = text.split(" ").join("");
                if(exp.test(clearedText)) {
                    parsedText = clearedText.toUpperCase();
                }
            }else if(text.split(" ").join("").length == 15){
				var exp = /^\*[\d-]{11,}\*$/;
				var clearedText = text.split(" ").join("");
				if(exp.test(clearedText)) {
				    parsedText = clearedText.replace(/[*-]/g, "");
				}
			}
            else if(text.indexOf("자재번호") > -1 && text.indexOf("제조년월") > -1 && text.indexOf("제조사") > -1 && text.indexOf("자재 ID") > -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
                        if(textArray[i].indexOf("자재 ID") > -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = keyValueArray[1].trim();
                            break;
                        }
                    }
                }
            }
			else if(text.indexOf("제조자") > -1 
			        && text.indexOf("상담전화번호") > -1 
			        && text.indexOf("자재번호") > -1 
			        && text.indexOf("제조년월") > -1 
			        && (text.indexOf("계기ID") > -1 || text.indexOf("계기 ID") > -1)) {
			    let textArray = [];
			    if(text.split('\r').length > 1) {
			        textArray = text.split('\r');
			    }
			    else if(text.split('\n').length > 1) {
			        textArray = text.split('\n');
			    }
			    if(textArray.length > 1) {
			        for(let i = 0; i < textArray.length; i++) {
						if(textArray[i].indexOf("제조년월") > -1) {
						    let keyValueArray = textArray[i].split(":");
						    parsedText2 = "20"+keyValueArray[1].trim().replace(/\D/g, "");
						}
			            if(textArray[i].indexOf("계기ID") > -1 || textArray[i].indexOf("계기 ID") > -1) {
			                let keyValueArray = textArray[i].split(":");
			                parsedText = keyValueArray[1].trim();
			            }
			        }
			    }
			}
            else if(text.indexOf("제조사") > -1 
                    && text.indexOf("상담전화번호") > -1 
                    && text.indexOf("자재번호") > -1 
                    && text.indexOf("제조년월") > -1 
                    && (text.indexOf("계기ID") > -1 || text.indexOf("계기 ID") > -1)) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
						if(textArray[i].indexOf("제조년월") > -1) {
						    let keyValueArray = textArray[i].split(":");
						    parsedText2 = "20"+keyValueArray[1].trim().replace(/\D/g, "");
						}						
                        if(textArray[i].indexOf("계기ID") > -1 || textArray[i].indexOf("계기 ID") > -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = keyValueArray[1].trim();
                        }
                    }
                }
            }
            else if(text.indexOf("자재번호") > -1 && text.indexOf("제조년월") > -1 && text.indexOf("자재ID") > -1 && text.indexOf("전화번호") > -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
                        if(textArray[i].indexOf("전화번호") > -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = keyValueArray[1].trim();
                            break;
                        }
                    }
                }
            }
            else if(text.indexOf("기기명") > -1 && text.indexOf("제조년월") > -1 && text.indexOf("제조사") > -1 && text.indexOf("제조국가") > -1 && text.indexOf("제조번호") > -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
                        if(textArray[i].indexOf("제조번호") > -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = keyValueArray[1].trim();
                            break;
                        }
                    }
                }
            }
            else if(text.indexOf("PID") > -1 && text.indexOf("YYMM") > -1 && text.indexOf("MID") > -1) {
                let textArray = [];
                textArray = text.split(/\r?\n/);
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
						if(textArray[i].indexOf("YYMM") > -1) {
						    let keyValueArray = textArray[i].split(":");
						    parsedText2 = "20"+keyValueArray[1].trim().replace(/\D/g, "");
						}						
                        if(textArray[i].indexOf("MID") > -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = keyValueArray[1].trim();
                        }
                    }
                }else if(textArray.length == 1){ //한 줄에 PID, YYMM, MID 존재
					for (let i = 0; i < textArray.length; i++) {
						const line = textArray[i];
						const yymmMatch = line.match(/YYMM\s*:\s*([\d.]+)/);
						const midMatch = line.match(/MID\s*:\s*([0-9A-Z]+)/);
						if (yymmMatch) {
							parsedText2 = "20" + yymmMatch[1].replace(/\D/g, "");
						}
						if (midMatch) {
							parsedText = midMatch[1];
						}
					}
				}
            }
            else if(text.indexOf("PID") > -1 && text.indexOf("MID") > -1 && text.indexOf("YYMM") == -1) {
                parsedText = text.substring(text.indexOf("MID") + 4, text.length);
                if(parsedText) {
                    parsedText = parsedText.trim();
                }
            }
			else if(text.indexOf("BID.NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("BID") > -1 && text.indexOf("Q'TY") > -1 && text.indexOf("PLID") == -1) {
				let textArray = [];
				textArray = text.split(/\r?\n/);
				if(textArray.length == 1) { //한 줄에 BID.NO, PID, BID, Q'TY 존재
				    for(let i = 0; i < textArray.length; i++) {
						const line = textArray[i];
						const bidMatch = line.match(/BID\s*:\s*([A-Z]?\d+)/);
						//const bidMatch = line.match(/BID\s*:\s*(\d+)/);
						if (bidMatch) {
							const value = bidMatch[1].trim();
							const result = value.indexOf("B") > -1 ? value : lpad(value, "0", 6);
							parsedText = result;
				        }
				        
				        const pidMatch = line.match(/PID\s*:\s*([A-Z]?\d+)/);
				        if(pidMatch){
							const value = bidMatch[1].trim();
							const result = value.indexOf("P") > -1 ? value : lpad(value, "0", 6);
							parsedText2 = result;
						}
				    }
				}else if(textArray.length > 1) {
				    for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("BID") > -1 && textArray[i].indexOf("BID.NO") == -1) {
				            let keyValueArray = textArray[i].split(":");
				            if(keyValueArray[1].indexOf("B") > -1 ){
				                parsedText = keyValueArray[1].trim(); //new QR
				            }else{
				                parsedText = lpad(keyValueArray[1].trim(), "0", 6); //old QR
				            }
				            break;
				        }
				    }
				    
				    for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("PID") > -1) {
				            let keyValueArray = textArray[i].split(":");
				            if(keyValueArray[1].indexOf("P") > -1 ){
				                parsedText2 = keyValueArray[1].trim(); //new QR
				            }else{
				                parsedText2 = lpad(keyValueArray[1].trim(), "0", 6); //old QR
				            }
				            break;
				        }
				    }
				}
			}
            else if(text.indexOf("BID.NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("BID") > -1 && text.indexOf("Q'TY") > -1 && text.indexOf("PLID") == -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
						if(textArray[i].indexOf("BID.NO") > -1) {
						    let keyValueArray = textArray[i].split(":");
						    parsedText2 = keyValueArray[1].trim();
						}
                        if(textArray[i].indexOf("BID") > -1 && textArray[i].indexOf("BID.NO") == -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = lpad(keyValueArray[1].trim(), "0", 6);
                        }
                    }
                }
            }
            else if(text.indexOf("BID.NO") > -1 && text.indexOf("CON.NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("BID") > -1 && text.indexOf("QTY") > -1 && text.indexOf("PLID") == -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
						if(textArray[i].indexOf("BID.NO") > -1) {
						    let keyValueArray = textArray[i].split(":");
						    parsedText2 = keyValueArray[1].trim();
						}
                        if(textArray[i].indexOf("BID") > -1 && textArray[i].indexOf("BID.NO") == -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = lpad(keyValueArray[1].trim(), "0", 6);
                        }
                    }
                }
            }
            else if(text.indexOf("BID NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("PLID") > -1 && text.indexOf("Q'TY") > -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
                        if(textArray[i].indexOf("PLID") > -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = lpad(keyValueArray[1].trim(), "0", 6);
                            break;
                        }
                    }
                    
                    for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("PID") > -1) {
				            let keyValueArray = textArray[i].split(":");
				            if(keyValueArray[1].indexOf("P") > -1 ){
				                parsedText2 = keyValueArray[1].trim(); //new QR
				            }else{
				                parsedText2 = lpad(keyValueArray[1].trim(), "0", 6); //old QR
				            }
				            break;
				        }
				    }
				    
                }
            }
			else if(text.indexOf("BID NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("PLID") > -1 && text.indexOf("Q'YT") > -1) {
			    let textArray = [];
			    textArray = text.split(/\r?\n/);
			    if(textArray.length > 0) { //한 줄에 BID NO,  PID, PLID, Q'YT 존재
			        for(let i = 0; i < textArray.length; i++) {
			            if(textArray[i].indexOf("PLID") > -1) {
							const line = textArray[i];
							const plidMatch = line.match(/PLID\s*:\s*(\d+)/);
							if (plidMatch) {
								parsedText = lpad(plidMatch[1].trim(), "0", 6);
							}
							break;
			            }
			        }
			    }
			}
			else if(text.indexOf("BID.NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("PLID") > -1 && text.indexOf("QTY") > -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
                        if(textArray[i].indexOf("PLID") > -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = lpad(keyValueArray[1].trim(), "0", 6);
                            break;
                        }
                    }
                    
                    for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("PID") > -1) {
				            let keyValueArray = textArray[i].split(":");
				            if(keyValueArray[1].indexOf("P") > -1 ){
				                parsedText2 = keyValueArray[1].trim(); //new QR
				            }else{
				                parsedText2 = lpad(keyValueArray[1].trim(), "0", 6); //old QR
				            }
				            break;
				        }
				    }
				    
                }
            }
            else if(text.indexOf("BID.NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("PLID") > -1 && text.indexOf("Q'TY") > -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
                        if(textArray[i].indexOf("PLID") > -1) {
                            let keyValueArray = textArray[i].split(":");
							if(keyValueArray[1].indexOf("P") > -1 ){
								parsedText = keyValueArray[1].trim();
							}else{
								parsedText = lpad(keyValueArray[1].trim(), "0", 6);	
							}
                            break;
                        }
                    }
                    
                    for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("PID") > -1) {
				            let keyValueArray = textArray[i].split(":");
				            if(keyValueArray[1].indexOf("P") > -1 ){
				                parsedText2 = keyValueArray[1].trim(); //new QR
				            }else{
				                parsedText2 = lpad(keyValueArray[1].trim(), "0", 6); //old QR
				            }
				            break;
				        }
				    }
				    
                }
            }
            else if(text.indexOf("BIN NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("PLID") > -1 && text.indexOf("Q'TY") > -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
                        if(textArray[i].indexOf("PLID") > -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = lpad(keyValueArray[1].trim(), "0", 6);
                            break;
                        }
                    }
                    
                    for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("PID") > -1) {
				            let keyValueArray = textArray[i].split(":");
				            if(keyValueArray[1].indexOf("P") > -1 ){
				                parsedText2 = keyValueArray[1].trim(); //new QR
				            }else{
				                parsedText2 = lpad(keyValueArray[1].trim(), "0", 6); //old QR
				            }
				            break;
				        }
				    }
                }
            }
			else if(text.indexOf("BID NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("PLID") > -1 && text.indexOf("Q' TY") > -1) {
			    let textArray = [];
			    if(text.split('\r').length > 1) {
			        textArray = text.split('\r');
			    }
			    else if(text.split('\n').length > 1) {
			        textArray = text.split('\n');
			    }
			    if(textArray.length > 1) {
			        for(let i = 0; i < textArray.length; i++) {
			            if(textArray[i].indexOf("PLID") > -1) {
			                let keyValueArray = textArray[i].split(":");
			                parsedText = lpad(keyValueArray[1].trim(), "0", 6);
			                break;
			            }
			        }
			        
			        for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("PID") > -1) {
				            let keyValueArray = textArray[i].split(":");
				            if(keyValueArray[1].indexOf("P") > -1 ){
				                parsedText2 = keyValueArray[1].trim(); //new QR
				            }else{
				                parsedText2 = lpad(keyValueArray[1].trim(), "0", 6); //old QR
				            }
				            break;
				        }
				    }
			    }
			}
			else if(text.indexOf("SKT") > -1) {
				const match = text.match(/\d{11}/);
				const textVal = match ? match[0] : text;
				parsedText = textVal;
			}
			else if(text.indexOf("계약번호") > -1 && text.indexOf("자재번호") > -1 && text.indexOf("박스번호") > -1 && text.indexOf("수량") > -1) {
				let textArray = [];
				textArray = text.split(/\r?\n/);
				if(textArray.length > 1) {
				    for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("박스번호") > -1) {
				            let keyValueArray = textArray[i].split(":");
				            parsedText = lpad(keyValueArray[1].trim(), "0", 6);
				            break;
				        }
				    }
				}
			}
			else if(text.indexOf("자재번호") > -1 && text.indexOf("제조년월") > -1 && text.indexOf("자재 ID") > -1) {
				let textArray = [];
				textArray = text.split(/\r?\n/);
				if(textArray.length > 1) {
				    for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("자재 ID") > -1) {
				            let keyValueArray = textArray[i].split(":");
				            parsedText = keyValueArray[1].trim();
				            break;
				        }
				    }
				}
			}
			//20260305 신규패턴 추가 {"pcknNo":"0PCW99JP4QKY3"}
			else if(text.indexOf("pcknNo") > -1) {
				const match = text.match(/"pcknNo"\s*:\s*"([^"]+)"/);
				const textVal = match ? match[0] : text;
				parsedText = textVal;
			}
            else {
                parsedText = text;
            }
            if(parsedText.indexOf("*") > -1) {
                parsedText.replaceAll("*", "");
            }
            return { value: parsedText, value2: parsedText2 };
}
  // ===== /parseValue =====

  function convertForField(field, raw) {
    var p = (typeof parseValue === 'function') ? (parseValue(raw) || {}) : {};
    var value = (p.value != null && p.value !== '') ? p.value : raw;
    var f = field || '';
    var r = String(raw || '');
    // 1) raw 형식으로 계기/모뎀 자동 판별 (계기 QR과 모뎀 QR은 형식이 다름 — 영준님)
    if (/계기\s*ID/.test(r)) return value;             // 계기 QR = 변환 없음 (계기번호 그대로)
    if (/자재\s*ID/.test(r)) return modemTo012(value);  // 모뎀(자재) QR = 012 + 끝8 변환
    // 2) raw가 애매하면 타겟 필드(vFlmnCl)로 보조 판별
    if (/INSTR_NUM|METER_ID/.test(f)) return value;
    if (/DCU_ID/.test(f)) return value;
    if (/MAC|MODEM/.test(f)) return modemTo012(value);
    // 3) 기본: 변환 안 함 (계기 오변환 방지). 순수 모뎀 11자리(012…)면 parseValue가 그대로 반환.
    return value;
  }

  var NAME_BY_FIELD = { 'MAC_MODEM': '모뎀맥', 'INSTR_NUM': '계기번호', 'MB_METER_ID': '대표계기',
    'EXT_DCU_ID': '기존 DCU_ID', 'NEW_DCU_MAC': '사용 DCU자재', 'EXT_DCU_MAC': '기존 DCU자재' };
  function findInputByField(field) {
    if (field && NAME_BY_FIELD[field]) {
      var n = document.querySelector('input[name="' + NAME_BY_FIELD[field] + '"]');
      if (n) return n;
    }
    return document.querySelector('input[placeholder*="설비ID"]')
      || document.querySelector('input[name="모뎀맥"]')
      || document.querySelector('input[name="계기번호"]')
      || document.querySelector('input[placeholder*="설비"]')
      || null;
  }
  function setInput(input, val) {
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function triggerSearch(input) {
    ['keydown', 'keyup'].forEach(function (t) {
      input.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    });
    var btn = Array.prototype.slice.call(document.querySelectorAll('button,a'))
      .find(function (b) { return /검색/.test(b.textContent || ''); });
    if (btn) btn.click();
  }

  try { console.log('[awms-inject] ' + VER); } catch (e) {}

  // (리모컨 버전 배지 제거 — 안정화)

  // ── 로그인 자동입력 ──
  // 계정 소스 우선순위: __helperCred(네이티브) > localStorage(리모컨 저장) > 없음
  // awms-bridge(통신팀, __awmsHelper 없음)는 완전 무동작.
  // 옛 APK(__helperCred 없음)도 __awmsHelper=true 주입 → localStorage 기반 동작.
  function isVisibleInput(el) {
    if (!el || el.type === 'hidden') return false;
    try {
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
    } catch (e) {}
    return el.offsetParent !== null;
  }

  // 로그인 폼에서 아이디/비번칸 탐색 (tryLoginAutofill + 저장 리스너 양쪽에서 재사용)
  function detectLoginFields() {
    var pwInputs = Array.prototype.filter.call(
      document.querySelectorAll('input[type="password"]'), isVisibleInput
    );
    if (pwInputs.length === 0) return null;
    var pwInput = pwInputs[0];
    var allInputs = Array.prototype.slice.call(document.querySelectorAll('input'));
    var pwIdx = allInputs.indexOf(pwInput);
    var scope = pwInput.closest ? pwInput.closest('form') : null;
    var candidates = allInputs.slice(0, pwIdx).filter(function (el) {
      if (!isVisibleInput(el)) return false;
      var t = (el.type || '').toLowerCase();
      return t === 'text' || t === 'tel' || t === 'email';
    });
    var scopeCandidates = scope
      ? candidates.filter(function (el) { return scope.contains(el); })
      : candidates;
    if (scopeCandidates.length) candidates = scopeCandidates;
    var idInput = null;
    var keyRe = /id|user|아이디|로그인/i;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (keyRe.test(el.name || '') || keyRe.test(el.id || '') || keyRe.test(el.placeholder || '')) {
        idInput = el; break;
      }
    }
    if (!idInput && candidates.length) idInput = candidates[candidates.length - 1];
    return { idInput: idInput, pwInput: pwInput };
  }

  function tryLoginAutofill() {
    // [v62] __awmsHelper 게이트 제거 — bridge/queue(영준님 전용)에서도 자동입력.
    // 저장된 cred 없으면 어차피 안 채우고 저장 리스너만 등록(안전). 계정은 폰 localStorage에만(공개 노출 X).

    // 계정 소스: 네이티브(__helperCred) 우선, 없으면 localStorage
    var cred = (window.__helperCred && window.__helperCred.id)
      ? window.__helperCred
      : { id: localStorage.getItem('helper_cred_id') || '', pw: localStorage.getItem('helper_cred_pw') || '' };

    // 로그인 화면 판별: visible password input 1개 이상
    var fields = detectLoginFields();
    if (!fields) return;
    var idInput = fields.idInput;
    var pwInput = fields.pwInput;

    // 이미 채웠으면 중복 방지
    if (window.__loginAutofillDone) return;

    // 저장 리스너: cred 유무와 무관하게 로그인 폼 감지되면 1회 등록
    installLoginCredListener(idInput, pwInput);

    // 디버그 표시 (소스 + 칸 감지 결과)
    try {
      var src = (window.__helperCred && window.__helperCred.id) ? 'cred'
              : (localStorage.getItem('helper_cred_id') ? 'ls' : 'none');
      var dbgId = idInput ? (idInput.name || idInput.id || '(noname)') : 'NONE';
      var dbgPw = pwInput ? 'OK' : 'NONE';
      var toast = document.createElement('div');
      toast.textContent = 'helper: src=' + src + ' id=' + dbgId + ' pw=' + dbgPw;
      toast.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:2147483647;background:rgba(0,0,0,.55);color:#fff;font:10px monospace;padding:3px 7px;border-radius:4px;pointer-events:none;';
      document.body.appendChild(toast);
      setTimeout(function () { try { toast.remove(); } catch (e) {} }, 1500);
    } catch (e) {}

    // 채울 값 없으면 자동입력은 건너뜀 (저장 리스너는 이미 등록됨)
    if (!cred.id) return;

    // 채우기
    if (idInput) setInput(idInput, cred.id);
    setInput(pwInput, cred.pw);

    // 실제로 채운 후에만 중복 방지 플래그 설정
    window.__loginAutofillDone = true;
    rec({ stage: 'login-autofill', src: (window.__helperCred && window.__helperCred.id) ? 'cred' : 'ls',
          idField: idInput ? (idInput.name || idInput.id || '?') : 'NONE' });
  }

  // 로그인 제출 시 계정 저장 리스너 (click + submit 캡처, 1회만 등록)
  function installLoginCredListener(idInputHint, pwInputHint) {
    if (!window.__awmsHelper) return;
    if (window.__loginCredListener) return;
    window.__loginCredListener = true;

    var loginSubmitRe = /로그인|login/i;

    function saveCurrentCred() {
      try {
        // 제출 시점에 실제 값을 다시 읽음 (자동입력 후 작업자 수정 반영)
        var f = detectLoginFields();
        var idEl = (f && f.idInput) || idInputHint;
        var pwEl = (f && f.pwInput) || pwInputHint;
        var id = idEl ? idEl.value : '';
        var pw = pwEl ? pwEl.value : '';
        if (id && pw) {
          localStorage.setItem('helper_cred_id', id);
          localStorage.setItem('helper_cred_pw', pw);
          rec({ stage: 'login-cred-save', src: 'submit' });
        }

        // OTP 자동입력용: 제출 시점에 awmsID 보관 + baseline ts 확보 (1회만)
        if (id && !window.__otpAwmsID) {
          window.__otpAwmsID = id;
          window.__otpBaselineTs = 0;
          var _otpFbBase = 'https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app/awmsOtp/';
          fetch(_otpFbBase + encodeURIComponent(id) + '.json')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
              window.__otpBaselineTs = (d && typeof d.ts === 'number') ? d.ts : 0;
              rec({ stage: 'otp-baseline', id: id, baseline: window.__otpBaselineTs });
            })
            .catch(function () {
              window.__otpBaselineTs = 0;
              rec({ stage: 'otp-baseline', id: id, baseline: 0, err: 'fetch-fail' });
            });
        }
      } catch (e) {}
    }

    // click 캡처: 로그인 버튼/제출 텍스트 감지
    document.addEventListener('click', function (e) {
      try {
        var el = e.target;
        if (!el) return;
        // 버튼/submit 타입이거나 텍스트에 "로그인"/"login" 포함
        var tag = (el.tagName || '').toLowerCase();
        var type = (el.type || '').toLowerCase();
        var txt = (el.textContent || el.value || '').trim();
        var isSubmitEl = (tag === 'button') || (tag === 'input' && (type === 'submit' || type === 'button'));
        var hasLoginTxt = loginSubmitRe.test(txt);
        if (isSubmitEl || hasLoginTxt) {
          // 자격증명 저장 = password input 있는 폼과 연관된 경우만
          var f = detectLoginFields();
          if (f) { saveCurrentCred(); }
          // ── OTP 겹침방지: OTP 발송 트리거 버튼이면 "내가 요청자" 로컬 표시 ──
          // 같은 폰(A33) 헬퍼+아미큐 둘 다 NLS 감지 시, 요청한 앱만 카톡 캡쳐.
          // __markOtpReq = 네이티브가 주입(자기앱 SharedPreferences otp_req_ts=now). 없으면 무동작(구버전 앱).
          // ★v78: password폼 유무와 무관하게 마킹(if(f) 밖으로). 인증번호 재발송 화면엔 password칸이 없어
          //   if(f)=false로 막혀 마킹 누락→옛 ts 만료→캡쳐 스킵되던 버그 수정.
          var elId2 = el.id || '';
          if (/^(btnAuthor|btnLogin|btnRetry)$/.test(elId2) || /인증번호|로그인|login/i.test(txt)) {
            if (window.__markOtpReq) { try { window.__markOtpReq(); rec({ stage: 'otp-req-mark', btn: elId2 || txt.slice(0, 8) }); } catch (e) {} }
          }
        }
      } catch (e) {}
    }, true); // 캡처 단계

    // [v94] Enter 키 로그인 — awms login.html 은 #id·#pw·#authorization keypress(13)로 onLogin() 을 바로 부른다.
    //   click/submit 이 안 생겨 위 마킹이 빠지고 카톡 OTP 캡쳐가 '요청자 아님'으로 스킵됐다. 마킹은 cred 저장보다 먼저.
    document.addEventListener('keydown', function (e) {
      try {
        if (!(e.key === 'Enter' || e.keyCode === 13)) return;
        var el = e.target;
        if (!el) return;
        var id3 = el.id || '';
        var isLoginInput = /^(id|pw|authorization)$/.test(id3) || String(el.type || '').toLowerCase() === 'password';
        if (!isLoginInput) return;
        try {
          if (window.__markOtpReq) { window.__markOtpReq(); rec({ stage: 'otp-req-mark', btn: 'enter', el: id3 }); }
        } catch (e2) {}
        try { if (detectLoginFields()) saveCurrentCred(); } catch (e3) {}
      } catch (e) {}
    }, true); // 캡처 단계, preventDefault 절대 없음

    // submit 이벤트도 후킹 (엔터 제출 대비)
    document.addEventListener('submit', function (e) {
      try {
        // form 안에 password input 있으면 저장
        var form = e.target;
        if (form && form.querySelector && form.querySelector('input[type="password"]')) {
          saveCurrentCred();
        }
      } catch (e) {}
    }, true); // 캡처 단계, preventDefault 절대 없음
  }

  // ── OTP 자동입력 ──
  // awms 로그인 후 OTP 화면(#otpWrap input.otp-box 6개)이 나타나면
  // ami-work Firebase awmsOtp/{awmsID} 를 1.5초 간격으로 폴링해 신규 코드 자동 입력.
  // 주의: _FB_BASE(ami-jongno)와 다른 ami-work-1c49a DB 사용.
  var _OTP_FB_BASE = 'https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app/awmsOtp/';

  function tryOtpAutofill() {
    // 중복 기동 방지
    if (window.__otpAutofillInstalled) return;
    window.__otpAutofillInstalled = true;

    var _pollTimer = null;
    var _pollElapsed = 0;
    var POLL_INTERVAL = 1500; // ms
    var POLL_MAX = 60000;     // 최대 60초

    // OTP 6칸에 코드 채우기 + 인증 버튼 클릭
    function fillOtp(code) {
      var boxes = document.querySelectorAll('#otpWrap input.otp-box');
      if (!boxes || boxes.length < 6) return false;
      var str = String(code);
      for (var i = 0; i < boxes.length; i++) {
        var digit = i < str.length ? str.charAt(i) : '';
        var box = boxes[i];
        // value setter + input + change (setInput 재사용) + keyup 별도 디스패치
        setInput(box, digit);
        try {
          box.dispatchEvent(new KeyboardEvent('keyup', { key: digit, bubbles: true }));
        } catch (e) {}
      }
      // 로그인 버튼 탐색 후 클릭 (없으면 입력만)
      // 우선: .login-form 또는 document 에서 button.btn-login
      // 제외: 재발송/받기/발송/취소 텍스트 버튼 (절대 누르면 안 됨)
      try {
        var loginForm = document.querySelector('.login-form') || document;
        // 1순위: button.btn-login
        var authBtn = loginForm.querySelector('button.btn-login');
        if (!authBtn) {
          // 2순위: 텍스트가 정확히 "로그인"인 버튼
          var allBtns = Array.prototype.slice.call(loginForm.querySelectorAll('button,input[type="submit"],input[type="button"]'));
          authBtn = allBtns.find(function (b) {
            var txt = (b.textContent || b.value || '').trim();
            // 재발송/받기/발송/취소는 절대 제외
            if (/재발송|받기|발송|취소/.test(txt)) return false;
            return txt === '로그인';
          });
        }
        if (authBtn) authBtn.click();
      } catch (e) {}
      return true;
    }

    // 헬퍼 내장 OTP 직접 경로 — 네이티브(OtpReaderService)가 webview에 직접 전달.
    // Firebase 폴링 경로와 동일한 fillOtp 호출. 이중입력 방지: stopPoll() 먼저.
    window.__otpReceived = function (code) {
      try {
        stopPoll();
        window.__otpFillAt = Date.now();
        var ok = fillOtp(String(code));
        var bl = document.getElementById('btnLogin');
        rec({ stage: 'otp-native-direct', ok: ok, btnShown: !!(bl && bl.style.display !== 'none'), btnDis: !!(bl && bl.disabled) });
      } catch (e) {}
    };

    function stopPoll() {
      if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    }

    function startPoll() {
      if (_pollTimer) return; // 이미 폴링 중
      _pollElapsed = 0;
      _pollTimer = setInterval(function () {
        _pollElapsed += POLL_INTERVAL;
        if (_pollElapsed > POLL_MAX) {
          stopPoll();
          return;
        }
        var awmsId = window.__otpAwmsID;
        if (!awmsId) return;
        var baseline = window.__otpBaselineTs || 0;
        fetch(_OTP_FB_BASE + encodeURIComponent(awmsId) + '.json')
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            if (!d || !d.code || typeof d.ts !== 'number') return;
            if (d.ts <= baseline) return; // 이전 OTP — 무시 (만료 코드 자동입력 방지)
            // 신규 OTP 수신
            stopPoll();
            var code = String(d.code);
            var ok = fillOtp(code);
            rec({ stage: 'otp-autofill', id: awmsId, code2: code.slice(0, 2), ok: ok });
            // single-use: 사용 후 Firebase 노드 삭제
            fetch(_OTP_FB_BASE + encodeURIComponent(awmsId) + '.json', { method: 'DELETE' })
              .catch(function () {});
          })
          .catch(function () {});
      }, POLL_INTERVAL);
    }

    // MutationObserver: #otpWrap input.otp-box 6개 등장 감지 → 폴링 시작
    // OTP 화면은 로그인 submit 이후 SPA 네비게이션으로 나타나므로 Observer가 필요
    try {
      var observer = new MutationObserver(function () {
        var boxes = document.querySelectorAll('#otpWrap input.otp-box');
        if (boxes.length >= 6) {
          startPoll();
        } else if (_pollTimer) {
          // OTP 화면이 사라지면 폴링 중단 + 플래그 초기화(다음 로그인 대비)
          stopPoll();
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}

    // 이미 OTP 화면이 떠 있을 경우 즉시 체크
    try {
      if (document.querySelectorAll('#otpWrap input.otp-box').length >= 6) startPoll();
    } catch (e) {}
  }

  // 로그인 자동입력 트리거: 즉시 + 300ms + 1000ms (늦게 렌더되는 폼 대응)
  try {
    if (window.__awmsHelper) {
      if (document.body) {
        tryLoginAutofill();
      } else {
        document.addEventListener('DOMContentLoaded', tryLoginAutofill);
      }
      setTimeout(tryLoginAutofill, 300);
      setTimeout(tryLoginAutofill, 1000);
      // OTP 자동입력 Observer 기동 (로그인 흐름과 동일 라이프사이클)
      tryOtpAutofill();
    }
  } catch (e) {}

  window.__onNativeScan = function (raw) {
    // [v97] 자재관리 추가 칸에서 연 스캔이면 대기 목록으로만 보낸다(awms 칸에 안 넣음). 한 번 읽으면 끝 — 다음은 [스캔] 다시
    if (window.__stockScanCb && document.getElementById('__stock_addpanel')) {
      var scb = window.__stockScanCb; window.__stockScanCb = null;
      try { scb(raw || ''); } catch (e) {}
      return;
    }
    var field = window.__pendingField || '';
    var vm = window.__pendingVM || getAwmsVM();
    rec({ stage: 'scan', raw: raw, field: field });
    if (!raw) return;
    var val = convertForField(field, raw);
    rec({ stage: 'convert', val: val, field: field });

    if (vm && field && vm.mainList && vm.mainList.currentRow) {
      try {
        if (typeof vm.$set === 'function') vm.$set(vm.mainList.currentRow, field, val);
        else vm.mainList.currentRow[field] = val;
        rec({ stage: 'inject-vue', field: field });
        // 스캔값은 확정 판정(force=true). watch 도 걸리지만 그쪽은 손입력 배려로 force=false 라
        // 짧게 끊긴 오독(자릿수 모자람)을 놓친다 — 스캔 경로에서 한 번 더 본다.
        if (/MAC|MODEM/.test(field)) {
          checkMacValue(val, true, function () {
            if (window.AndroidScanner && window.AndroidScanner.scan) window.AndroidScanner.scan();
          });
        }
        return;
      } catch (e) { rec({ stage: 'inject-vue-fail', msg: String(e) }); }
    }
    var input = findInputByField(field);
    if (input) {
      setInput(input, val);
      rec({ stage: 'inject-dom', field: field });
      // 스캔으로 들어온 맥은 그 자리에서 확정 판정(force=true) — 오독이면 [맥 오류] 박스.
      if (/MAC|MODEM/.test(field)) {
        checkMacValue(val, true, function () {
          if (window.AndroidScanner && window.AndroidScanner.scan) window.AndroidScanner.scan();
        });
      }
      if (/설비ID/.test(input.placeholder || '')) setTimeout(function () { triggerSearch(input); }, 120);
    } else {
      alert('변환값: ' + val + '\n(입력칸 ' + (field || '?') + ' 못 찾음)');
    }
  };

  try {
    if (!window.__scanHook) {
      window.__scanHook = true;
      document.addEventListener('click', function (e) {
        try {
          var el = e.target && e.target.closest && e.target.closest('button,a,p,div,span,li');
          if (!el) return;
          var txt = (el.textContent || '').trim().toUpperCase();
          // QRCODE만 우리 구글 스캐너로 가로챔. BARCODE는 가로채지 않음 → awms 원래 바코드 스캐너 그대로(우리 스캐너 바코드 오독 다발로 원복). 영준님 2026-07-15.
          if (txt === 'QRCODE') {
            e.preventDefault(); e.stopImmediatePropagation();
            var vm = getAwmsVM();
            window.__pendingVM = vm;
            window.__pendingField = vm ? (vm.vFlmnCl || '') : '';
            rec({ stage: 'intercept', txt: txt, field: window.__pendingField });
            closeFlmnModal();
            if (window.AndroidScanner && window.AndroidScanner.scan) window.AndroidScanner.scan();
            else alert('네이티브 스캐너 없음 (앱 업데이트 필요)');
          }
        } catch (err) {}
      }, true);
      console.log('[awms-inject] scan-intercept + parseValue + vFlmnCl autofill installed');
    }
  } catch (e) {}

  // ── 헬퍼: 설비등록 폼 자동선택 (지사/동행) ──
  // awms-bridge(통신팀): TEAM_DEFAULTS 고정값 항상 적용
  // awms-helper(__awmsHelper=true, 계기팀): localStorage 마지막 저장값 복원 (없으면 아무것도 안 함)
  var TEAM_DEFAULTS = { DEPT2: '7793', MTR_WITH_YN: 'Y' };   // 통신팀(종로/서울본부직할). 계기팀=N+다른지사
  function setRow(vm, row, key, val) {
    if (row[key]) return;                                     // 빈 칸일 때만 — 수동/기존값 보존
    if (typeof vm.$set === 'function') vm.$set(row, key, val); else row[key] = val;
  }
  // 진단/수집: 지사·동행 옵션 목록을 logcat(console)으로 덤프. 찾으면 1회만.
  var __deptDumped = false;
  function dumpDeptOptions(vm) {
    if (__deptDumped) return;
    try {
      var hit = false;
      var src = (vm && vm.$data) || vm || {};
      for (var k in src) {
        var v = src[k];
        if (Array.isArray(v) && v.length && v.length < 2000) {
          var s = JSON.stringify(v[0] || {});
          if (/DEPT|OFFICE|HDQR|본부|지사/i.test(s) || /dept|office|hdqr/i.test(k)) {
            console.log('[DEPTLIST] vm.' + k + ' n=' + v.length + ' ' + JSON.stringify(v).slice(0, 1200));
            hit = true;
          }
        }
      }
      document.querySelectorAll('select').forEach(function (sel, i) {
        if (sel.options && sel.options.length > 1) {
          var o = [].map.call(sel.options, function (x) { return x.value + ':' + (x.text || '').trim(); });
          console.log('[DEPTDOM] ' + (sel.name || sel.id || ('sel' + i)) + ' n=' + o.length + ' ' + o.slice(0, 120).join(' | '));
          hit = true;
        }
      });
      if (hit) __deptDumped = true;
    } catch (e) { console.log('[DEPTLIST] err ' + e.message); }
  }
  var __deptForced = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
  function applyDeptWith(vm) {
    try {
      var row = vm && vm.mainList && vm.mainList.currentRow;
      if (!row) return;
      dumpDeptOptions(vm);
      if (window.__awmsHelper) {
        // 헬퍼 모드: localStorage 마지막 저장값 복원. 피드백 루프 없음 — 저장 버튼 클릭 시에만 기록.
        var ld = localStorage.getItem('helper_last_dept');
        var lw = localStorage.getItem('helper_last_with');
        // [v87] 헬퍼 설정 화면의 지사·동행이 있으면 마지막 저장값보다 우선 (테스터 전용, 밤에 전체 적용 예정)
        if (__featOn()) {
          if (window.__helperDept) ld = window.__helperDept;
          if (window.__helperWith) lw = window.__helperWith;
          // [v88] awms fills DEPT2 on a new row itself (서대문은평), so the empty-only setRow never
          //   replaced it. Force the helper setting once per unsaved row (no REG_DATE); a manual change
          //   afterwards stays because the row is marked.
          if (__deptForced && !__deptForced.has(row)) {
            __deptForced.set(row, 1);
            var isNew = !row.REG_DATE;
            rec({ stage: 'dept-diag', before: row.DEPT2 || '', withBefore: row.MTR_WITH_YN || '', isNew: isNew, ld: ld || '', lw: lw || '', step: row.WORK_STEP || '', md: row.MODEM_DIV || '' });
            if (isNew) {
              var fs = typeof vm.$set === 'function';
              if (ld && String(row.DEPT2 || '') !== String(ld)) { if (fs) vm.$set(row, 'DEPT2', ld); else row.DEPT2 = ld; }
              if (lw && String(row.MTR_WITH_YN || '') !== String(lw)) { if (fs) vm.$set(row, 'MTR_WITH_YN', lw); else row.MTR_WITH_YN = lw; }
              rec({ stage: 'dept-force', DEPT2: row.DEPT2 || '', WITH: row.MTR_WITH_YN || '' });
            }
          }
        }
        console.log('[DEPT] helper=true ld=' + ld + ' lw=' + lw + ' before DEPT2=' + row.DEPT2 + ' WITH=' + row.MTR_WITH_YN);
        if (ld) setRow(vm, row, 'DEPT2', ld);
        if (lw) setRow(vm, row, 'MTR_WITH_YN', lw);
        console.log('[DEPT] after DEPT2=' + row.DEPT2 + ' WITH=' + row.MTR_WITH_YN);
        rec({ stage: 'auto-deptwith-helper', DEPT2: row.DEPT2, WITH: row.MTR_WITH_YN });
      } else {
        // awms-bridge(통신팀): 기존 동작 그대로 — 고정값 항상 적용
        setRow(vm, row, 'DEPT2', TEAM_DEFAULTS.DEPT2);
        setRow(vm, row, 'MTR_WITH_YN', TEAM_DEFAULTS.MTR_WITH_YN);
        rec({ stage: 'auto-deptwith', DEPT2: row.DEPT2, WITH: row.MTR_WITH_YN });
      }
    } catch (e) {}
  }

  // ── 헬퍼 전용: 임의추가 폼 지사/동행 <select> 자동적용 ──
  // __helperDept(지사코드) / __helperWith('Y'|'N') 를 select.value로 직접 세팅.
  // applyDeptWith(currentRow.DEPT2)와 역할이 달라 별도 함수 — 기존 함수 건드리지 않음.
  var __deptSelApplied = { dept: false, with: false };
  function applyDeptSelect() {
    if (!window.__awmsHelper) return;
    var hDept = window.__helperDept;
    var hWith = window.__helperWith;
    if (!hDept && !hWith) return;

    var selDept = null, selWith = null;
    var sels = document.querySelectorAll('select');
    for (var i = 0; i < sels.length; i++) {
      var sel = sels[i];
      var nm = sel.name || '';
      // 지사 select 찾기: name==='지사' 우선, 아니면 옵션 text에 '지사'/'본부' 포함
      if (!selDept && nm === '지사') { selDept = sel; }
      // 동행 select 찾기: name==='동행시공여부' 우선
      if (!selWith && nm === '동행시공여부') { selWith = sel; }
    }
    // 휴리스틱 폴백: name 없을 때
    if (!selDept || !selWith) {
      for (var j = 0; j < sels.length; j++) {
        var s2 = sels[j];
        var opts = [].slice.call(s2.options || []);
        // 지사 폴백: 옵션 text에 '지사' 또는 '본부' 포함하는 옵션이 있는 select
        if (!selDept && opts.some(function (o) { return /(지사|본부)/.test(o.text); })) { selDept = s2; }
        // 동행 폴백: 옵션이 정확히 N/Y 2개인 select (value 기준)
        if (!selWith && opts.length === 2) {
          var vals = opts.map(function (o) { return o.value; }).sort().join(',');
          if (vals === 'N,Y') { selWith = s2; }
        }
      }
    }

    // 지사 적용: 현재 value가 비어있을 때만
    if (selDept && hDept) {
      var curDept = selDept.value;
      var isEmpty = !curDept || curDept === '' || /지사\s*선택|선택/.test(curDept);
      if (isEmpty) {
        selDept.value = hDept;
        var deptOk = selDept.value === hDept;
        if (!__deptSelApplied.dept) {
          selDept.dispatchEvent(new Event('input', { bubbles: true }));
          selDept.dispatchEvent(new Event('change', { bubbles: true }));
          __deptSelApplied.dept = true;
          console.log('[DEPTSEL] dept set=' + hDept + ' ok=' + deptOk + ' with set=' + (hWith || ''));
        }
      }
    }
    // 동행 적용: 현재 value가 비어있을 때만
    if (selWith && hWith) {
      var curWith = selWith.value;
      var isWithEmpty = !curWith || curWith === '';
      if (isWithEmpty) {
        selWith.value = hWith;
        var withOk = selWith.value === hWith;
        if (!__deptSelApplied.with) {
          selWith.dispatchEvent(new Event('input', { bubbles: true }));
          selWith.dispatchEvent(new Event('change', { bubbles: true }));
          __deptSelApplied.with = true;
          if (!__deptSelApplied.dept) { // dept 로그에서 이미 출력 안 된 경우
            console.log('[DEPTSEL] dept set=' + (hDept || '') + ' ok=- with set=' + hWith + ' ok=' + withOk);
          }
        }
      }
    }
    // select가 사라지면(폼 닫힘) 다음 폼 오픈 시 재적용 가능하도록 플래그 리셋
    if (!selDept && !selWith) { __deptSelApplied.dept = false; __deptSelApplied.with = false; }
  }

  // ── [v95] 헬퍼: 설치불가/철거관리(MOBCST2000) — 모뎀 기본 선택 + 헬퍼 설정 지사 ──
  //   영준님 2026-11-11: "저장된 지사 적용을 불가에도 · DCU/모뎀 중 모뎀으로 · 임의추가 작성모달이 항상 서대문은평".
  //   ★서대문은평은 우리 inject 가 아니라 awms 가 채운다 — 이 화면 addRow 가 새 행 지사를 로그인 사용자의 awms
  //     작업자 세팅(selectOptions.setWorkUserList[0].DEPT2, 우영준 계정 = 3500 서대문은평)으로 넣는다.
  //   ★저장 body(insUnable FormData)는 currentRow 전체 + vKdnDept1/2 다. currentRow.DEPT2 는 tmpDeptSelect watcher 가
  //     옮기고 vKdnDept1/2 도 tmpDeptSelect 로 찾으므로, tmpDeptSelect 하나만 바꾸면 화면·저장이 같이 따라간다.
  //   게이트 = 1000 화면 지사 강제(applyDeptWith)와 같은 __awmsHelper + __featOn(). 설정 지사는 같은 window.__helperDept.
  //   화면 정의: https://awms.kdn.com/service/ami/html/sub/mob/cst/MOBCST2000.html (#app 의 Vue 루트).
  var __bulgaSeen = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
  function getBulgaVM() {
    var el = document.getElementById('app');
    var v = el && el.__vue__;
    if (v && ('tmpDeptSelect' in v) && ('radioVal' in v) && v.rsltList) return v;
    return null;
  }
  function applyBulgaHelper() {
    if (!window.__awmsHelper || !__bulgaSeen || !__featOn()) return;
    var vm = getBulgaVM();
    if (!vm) return;
    var st = __bulgaSeen.get(vm);
    if (!st) { st = { radio: false, list: false, rows: new WeakMap() }; __bulgaSeen.set(vm, st); }
    // 1) 모뎀 기본 — 이 화면을 처음 볼 때 한 번만(awms 기본은 DCU). 그 뒤 DCU 로 바꾸면 그대로 둔다.
    //    radioVal watcher 가 옵션·목록을 다시 불러온다(사람이 누른 것과 같은 길).
    if (!st.radio) {
      st.radio = true;
      if (vm.radioVal !== 'M' && !vm.rsltList.currentRow) {
        vm.radioVal = 'M';
        rec({ stage: 'bulga-radio-m' });
      }
    }
    var hDept = String(window.__helperDept || '');
    var opts = vm.deptOption || [];
    if (!hDept || !opts.length) return;
    if (!opts.some(function (o) { return String(o.DEPT2) === hDept; })) return;   // 이 화면 지사 목록에 없는 값이면 안 건드림
    // 2) 목록 지사 — 옵션이 들어온 뒤 한 번, '지사 전체'(빈 값)일 때만. select 의 @change 대신 fnSearch 를 직접 부른다.
    if (!st.list) {
      st.list = true;
      if (!vm.deptSelect) {
        vm.deptSelect = hDept;
        rec({ stage: 'bulga-list-dept', dept: hDept });
        try { if (typeof vm.fnSearch === 'function') vm.fnSearch(); } catch (e) { rec({ stage: 'bulga-list-search-err', err: String(e && e.message || e) }); }
      }
    }
    // 3) 새 행(등록 > 임의추가) — 행마다 한 번. 그 뒤 손으로 바꾼 지사는 그대로 둔다.
    //    대상리스트에서 고른 행(TGT_DIV_CD)은 그 대상의 지사라, 슬레이브 추가(MODEM_DIV 20)는 마스터 지사를 이어받으니 건드리지 않는다.
    //    저장된 행(WORK_STEP 있음)도 건드리지 않는다.
    var row = vm.rsltList.currentRow;
    if (!row || st.rows.has(row)) return;
    st.rows.set(row, 1);
    if (row.WORK_STEP || row.TGT_DIV_CD || String(row.MODEM_DIV || '') === '20') return;
    var before = String(vm.tmpDeptSelect || '');
    if (before !== hDept) vm.tmpDeptSelect = hDept;
    rec({ stage: 'bulga-row-dept', before: before, dept: hDept, radio: vm.radioVal });
  }
  window.__applyBulgaHelper = applyBulgaHelper;   // 진단용

  // ── 통신방식/분기 자동선택 (계기번호+맥 입력 후) ──
  // 마스터(MODEM_DIV=10): INST_S = 계기타입+맥 추론. 슬래이브(20): 직전 마스터 통신방식 따라옴.
  // 분기: 슬래이브가 아미고면 무선·아니면 0.5. (PLC는 site-data 통신방식 매핑 단계에서 확장 — __commMap)
  // INST_S suffix: 10=ks-plc 20=hpgp 40=LTE 70=lte_IV 80=iot-plc 90=k-dcu 92=smgw-c
  var lastMasterINST_S = '', lastMasterSuffix = '';
  function isAmigo(m) { return m === 'HW4050'; }
  function macIsLte(mac) { return /^012\d{8}$/.test(String(mac || '').replace(/\D/g, '')); }
  // site-data 통신방식 문자열 → INST_S suffix
  function commToSuffix(c) {
    var s = String(c || '').toUpperCase().replace(/[\s_-]/g, '');
    if (/SMGWC|SMGW/.test(s)) return '92';
    if (/LTEIV/.test(s)) return '70';
    if (s === 'LTE') return '40';
    if (/HPGP/.test(s)) return '20';
    if (/KDCU|IOTPLC/.test(s)) return '90';
    if (/KSPLC|^PLC$/.test(s)) return '10';
    return '';
  }
  // ── 모뎀맥 형식 법칙 (영준님 2026-09-09 확정 · 실측 modem_work 51,779행) ───────────
  // 정상은 두 갈래뿐이고 그 밖은 전부 오독이다.
  //   LTE류  '012' + 숫자 8자리 = 11자리, 전부 숫자
  //   PLC류  hex 12자리, 앞 6자리는 MAC_OUI 5개뿐 (847207 이면 7번째 자리는 0·B·C·D·E)
  // ★글자는 0-9·A-F 만 — 모든 타입 공통. 실측에서 나온 G·I·L·N·O·P·R·S 는 전부 스캐너 오독이었다.
  // ★정본은 백엔드 cst-input/backend/app.py 의 MAC_OUI. 새 모뎀이 들어오면 거기와 아미큐
  //   CollectScreen.kt, 그리고 여기 세 곳을 같이 고친다.
  var MAC_OUI = ['847207', 'E0AEED', 'AC5E8C', '44B433', '0014B0'];
  var MAC_847207_C7 = ['0', 'B', 'C', 'D', 'E'];

  // force=false = 사람이 타이핑하는 중 → 자릿수가 모자라면 조용히 넘긴다(입력 방해 금지).
  // force=true  = 스캔 결과 / 칸에서 나갔을 때 → 짧아도 오류로 본다.
  function macFormatError(mac, force) {
    var s = String(mac || '').replace(/[\s:\-*]/g, '').toUpperCase();
    if (!s) return null;
    var bad = s.replace(/[0-9A-F]/g, '');
    if (bad) {
      var u = ''; for (var i = 0; i < bad.length; i++) if (u.indexOf(bad[i]) < 0) u += bad[i];
      return { reason: '허용 외 문자 ' + u + ' (0~9·A~F만 허용)', suggest: '' };
    }
    if (/^012\d*$/.test(s)) {                       // LTE 계열
      if (s.length === 11) return null;
      if (!force && s.length < 11) return null;
      return { reason: 'LTE MAC 자릿수 ' + s.length + ' (기준 11)', suggest: '' };
    }
    if (s.length < 12) return force ? { reason: '자릿수 부족 ' + s.length + '자리', suggest: '' } : null;
    if (s.length > 12) return { reason: '자릿수 초과 ' + s.length + '자리 (중복 인식 의심)', suggest: '' };
    var oui = s.slice(0, 6);
    if (MAC_OUI.indexOf(oui) < 0) {
      var near = MAC_OUI.filter(function (o) {
        var d = 0; for (var k = 0; k < 6; k++) if (o.charAt(k) !== oui.charAt(k)) d++;
        return d === 1;
      });
      return { reason: '미사용 앞자리 ' + oui, suggest: near.join(' / ') };
    }
    if (oui === '847207' && MAC_847207_C7.indexOf(s.charAt(6)) < 0) {
      return { reason: '847207 7번째 자리 ' + s.charAt(6) + ' (0·B·C·D·E만 허용)', suggest: '' };
    }
    return null;
  }

  // [맥 오류] 박스. awms 화면 위에 직접 그린다(alert 는 화면을 막고 값도 못 보여준다).
  // ★자동 재스캔은 하지 않는다 — v82 때 자동 재시도가 무한루프를 냈다. 사람이 눌러야 다시 스캔한다.
  var __macErrShown = '';
  function showMacError(val, err, onRescan) {
    try {
      var old = document.getElementById('__macErrBox'); if (old) old.parentNode.removeChild(old);
      var wrap = document.createElement('div');
      wrap.id = '__macErrBox';
      wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.55);' +
        'display:flex;align-items:center;justify-content:center;padding:20px;';
      var box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:14px;padding:20px;max-width:340px;width:100%;' +
        'box-shadow:0 10px 40px rgba(0,0,0,.3);font-family:-apple-system,sans-serif;';
      box.innerHTML =
        '<div style="color:#d92d20;font-size:19px;font-weight:800;margin-bottom:10px">맥 오류</div>' +
        '<div style="color:#101828;font-size:15px;font-weight:700;line-height:1.4">' + err.reason + '</div>' +
        '<div style="color:#667085;font-size:12px;margin-top:12px">읽힌 값</div>' +
        '<div style="color:#101828;font-size:18px;font-weight:800;letter-spacing:.5px">' + val + '</div>' +
        (err.suggest ? '<div style="color:#b54708;font-size:13px;margin-top:10px">한 글자 차이 — ' +
          err.suggest + ' 여부 라벨 재확인 필요</div>' : '') +
        '<div style="display:flex;gap:8px;margin-top:18px">' +
        '<button id="__macErrRescan" style="flex:1;height:44px;border:0;border-radius:10px;' +
        'background:#175cd3;color:#fff;font-size:15px;font-weight:700">다시 스캔</button>' +
        '<button id="__macErrKeep" style="flex:1;height:44px;border:1px solid #d0d5dd;border-radius:10px;' +
        'background:#fff;color:#667085;font-size:15px">그대로 쓰기</button></div>';
      wrap.appendChild(box);
      document.body.appendChild(wrap);
      var close = function () { try { wrap.parentNode.removeChild(wrap); } catch (e) {} };
      box.querySelector('#__macErrKeep').onclick = close;
      var rescanBtn = box.querySelector('#__macErrRescan');
      if (onRescan) { rescanBtn.onclick = function () { close(); onRescan(); }; }
      else { rescanBtn.style.display = 'none'; box.querySelector('#__macErrKeep').textContent = '확인'; }
      rec({ stage: 'mac-error', val: val, reason: err.reason });
    } catch (e) { rec({ stage: 'mac-error-fail', msg: String(e) }); }
  }

  // 맥 값 검사 진입점. 같은 값으로 박스를 두 번 띄우지 않는다(타이핑 중 반복 발화 방지).
  function checkMacValue(val, force, onRescan) {
    var s = String(val || '').toUpperCase();
    var err = macFormatError(s, force);
    if (!err) { __macErrShown = ''; return false; }
    if (__macErrShown === s) return true;
    __macErrShown = s;
    showMacError(s, err, onRescan);
    return true;
  }

  // 모뎀맥 스캔값 → 통신방식 suffix. LTE(012)는 별도, hex MAC prefix는 결론문서 §3.
  function macToSuffix(mac) {
    var raw = String(mac || '');
    if (/^012\d{8}$/.test(raw.replace(/\D/g, ''))) return 'LTE';
    var m = raw.toUpperCase().replace(/[^0-9A-F]/g, '');
    if (/^847207/.test(m)) {
      var c = m.charAt(6);
      if (c === '0') {                                        // 7번째 0 = 기본 k-dcu, 단 8·9번째 핫스팟은 ks-plc
        var c89 = m.substr(7, 2);
        if (c89 === 'E3' || c89 === 'E4' || c89 === 'D9') return '10';  // E3/E4=PLC순수(K-DCU 0), D9=PLC우세(77%)
        return '90';
      }
      if (c === 'E') return '90';                             // k-dcu
      if (c === 'B' || c === 'C' || c === 'D') return '10';   // ks-plc
    }
    if (/^E0AEED/.test(m)) return '10';                       // ks-plc
    if (/^44B433/.test(m) || /^0014B0/.test(m)) return '20';  // hpgp
    if (/^AC5E8C/.test(m)) return '90';                       // k-dcu (2026-10-20: AC 모뎀은 전부 k-dcu로 통일)
    return '';
  }
  function inferMasterINST_S(instM, mac, meterNo) {
    if (!instM) return '';
    var suf = macToSuffix(mac);
    if (suf === 'SKIP') return '';                            // AC5E8C 등 애매 → commMap 폴백도 안 함, 직접 선택
    if (suf === 'LTE') return isAmigo(instM) ? instM + '92' : instM + '70';  // 아미고=smgw-c, 그외=lte_IV
    if (suf) return instM + suf;                               // PLC/k-dcu/hpgp = 맥 스캔값으로 확정
    if (window.__commMap && meterNo && window.__commMap[meterNo]) {  // 맥 미판별 → 계기번호 commMap 폴백
      var s2 = commToSuffix(window.__commMap[meterNo]);
      if (s2) return instM + s2;
    }
    return '';  // 미상 → 비워둠(영준님 직접 선택)
  }
  // label 텍스트로 select 찾기 — awms가 id(form0119 등)를 여러 칸에 중복 사용해 getElementById는 위험
  function findSelectByLabel(text) {
    var ths = document.querySelectorAll('th');
    for (var i = 0; i < ths.length; i++) {
      var lb = ths[i].querySelector('label');
      if (lb && (lb.textContent || '').trim() === text) {
        var tr = ths[i].closest('tr');
        var sel = tr && tr.querySelector('select');
        if (sel) return sel;
      }
    }
    return null;
  }
  // val이 option value면 그대로, 아니면 option 라벨로 매칭해 value 반환 (BUNGI는 value=C_CODE, 라벨=무선/0.5)
  function resolveOptionValue(sel, val) {
    var i;
    for (i = 0; i < sel.options.length; i++) if (String(sel.options[i].value) === String(val)) return val;
    for (i = 0; i < sel.options.length; i++) if ((sel.options[i].text || '').trim() === String(val)) return sel.options[i].value;
    return val;
  }
  function setSelectVal(vm, row, key, val, labelText) {
    if (!val) return;
    var tries = 0;
    (function w() {
      var sel = findSelectByLabel(labelText);
      if (sel) {
        var v = resolveOptionValue(sel, val);
        if (!row[key]) { if (typeof vm.$set === 'function') vm.$set(row, key, v); else row[key] = v; }  // 빈칸만 — 수동값 보존
        sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true }));
        if (String(sel.value) === String(v)) return;       // 반영 확인
      }
      if (++tries < 15) setTimeout(w, 150);                 // select/옵션 로드 대기
    })();
  }
  // 사진 공유: 마스터 시공전(ATCH_FILE_ID_3)만 슬래이브에 복사. (모뎀맥 4는 awms가 자동 공유함)
  // awms가 슬래이브 전환 시 3을 리셋 → ATCH_FILE_ID_3 watch가 리셋 직후 마스터값 복원(경쟁 회피).
  window.__masterPhoto3 = window.__masterPhoto3 || '';   // inject 재주입에도 영속
  function applyCommBungi(vm) {
    try {
      var row = vm && vm.mainList && vm.mainList.currentRow;
      if (!row) return;
      var instM = row.INST_M, mac = row.MAC_MODEM, modem = String(row.MODEM_DIV || ''), meter = row.INSTR_NUM;
      if (modem === '20') {                                 // 슬래이브: 슬래이브계기타입 + 마스터 통신suffix
        if (instM && lastMasterSuffix) setSelectVal(vm, row, 'INST_S', instM + lastMasterSuffix, '통신방식');
        setSelectVal(vm, row, 'BUNGI', (lastMasterSuffix === '92' && isAmigo(instM)) ? '무선' : '0.5', '분기기'); // 무선=아미고모뎀(마스터smgw-c)+아미고계기(슬래이브) 둘다, 그외 0.5
        rec({ stage: 'auto-comm-slave', INST_S: row.INST_S, BUNGI: row.BUNGI, suf: lastMasterSuffix });
      } else if (modem === '10') {                          // 마스터
        var s = inferMasterINST_S(instM, mac, meter);
        if (s) { setSelectVal(vm, row, 'INST_S', s, '통신방식'); lastMasterINST_S = s; lastMasterSuffix = s.slice(-2); rec({ stage: 'auto-comm-master', INST_S: s, suf: lastMasterSuffix }); }
      }
    } catch (e) {}
  }

  // 헬퍼 모드: 저장 버튼 클릭 시 currentRow 지사/동행값을 localStorage에 기록.
  // vm.saveAct 래핑 대신 버튼 이벤트 사용 — 저장 메서드명이 팀별로 다름(통신팀=saveAct, 계기팀=saveRow 등, v35 주석 참고).
  // preventDefault 없이 캡처만 — 저장 동작은 그대로.
  function installSaveListener() {
    if (window.__helperSaveListenerInstalled) return;
    window.__helperSaveListenerInstalled = true;
    document.addEventListener('click', function (e) {
      try {
        var btn = e.target && (e.target.closest ? e.target.closest('button,a,.btn') : null);
        if (!btn) return;
        var txt = (btn.textContent || btn.innerText || '').trim();
        if (txt !== '저장') return;
        var vm = getAwmsVM();
        if (!vm || !vm.mainList) return;
        var r = vm.mainList.currentRow;
        if (!r) return;
        if (r.DEPT2) localStorage.setItem('helper_last_dept', r.DEPT2);
        if (r.MTR_WITH_YN) localStorage.setItem('helper_last_with', r.MTR_WITH_YN);
        rec({ stage: 'helper-save-record', DEPT2: r.DEPT2, WITH: r.MTR_WITH_YN });
      } catch (ex) {}
    }, true);
  }

  // [v64] 대표계기(MB_METER_ID) → 계기번호(INSTR_NUM) 자동복사 — 마스터(MODEM_DIV=10) 전용, 옵션 ON일 때만, 계기번호 빈칸일 때만.
  // 옵션값 window.__helperMbToMeter 는 헬퍼 앱이 네이티브로 주입(지사/동행과 동일 경로). APK 적용 전엔 undefined → 자동 비활성.
  function applyMbToMeter(vm) {
    if (!window.__helperMbToMeter) return;                 // 옵션 OFF면 미동작
    var row = vm && vm.mainList && vm.mainList.currentRow;
    if (!row) return;
    if (String(row.MODEM_DIV || '') !== '10') return;      // 마스터 전용 (슬래이브 MD=20 제외)
    var _mb = String(row.MB_METER_ID || '');
    // [v67] 11자리(계기번호 자릿수) 완성 시만 복사. 수기 입력은 한 글자씩 watch 발화 →
    //   첫 글자만 복사되고 빈칸조건에 막히던 버그. QR/OCR은 한번에 11자리라 정상.
    if (_mb.length >= 11 && !row.INSTR_NUM) {              // 자릿수 충족 + 계기번호 빈칸일 때만(수동값 보존)
      setRow(vm, row, 'INSTR_NUM', _mb);
      rec({ stage: 'mb-to-meter', v: _mb });
    }
  }
  // [v63] 시공전(A3) 슬래이브 전파 — awms가 addRow로 모뎀 슬래이브 자동생성 시 param.ATCH_FILE_ID_4만 채우고 A3는 빈값으로 둠.
  // 그 addRow를 가로채 같은 모뎀(MAC_MODEM)의 마스터 시공전을 param.ATCH_FILE_ID_3에 주입 → A4와 동일하게 따라감.
  // 행 생성 시점 주입이라 polling/callback(awms가 덮어씀)보다 확실. 모뎀별 맵(__sigongMap)으로 cross-modem 안전. __awmsHelper 전용.
  // (CDP trap 실증: param.A4=F656은 awms가 채움 / param.A3=""→주입 시 슬래이브에 시공전 따라옴 확인)
  function installAddRowHook(vm) {
    if (!window.__awmsHelper) return;
    var m = vm && vm.mainList;
    if (!m || m.__sigongAddRowHook) return;
    var orig = m.addRow;
    if (typeof orig !== 'function') return;
    m.addRow = function (p) {
      try {
        if (p && typeof p === 'object') {
          rec({ stage: 'addrow-life', md: p.MODEM_DIV, mac: p.MAC_MODEM || '', a3: p.ATCH_FILE_ID_3 || '', a4: p.ATCH_FILE_ID_4 || '' });
          if (p.ATCH_FILE_ID_4 && !p.ATCH_FILE_ID_3) {          // awms가 A4 담아준 모뎀 슬래이브 = A3도 따라가야 할 자리
            var mac = p.MAC_MODEM || '';
            var src = (window.__sigongMap && window.__sigongMap[mac]) || '';
            if (!src) { var cr = m.currentRow; if (cr && cr.MAC_MODEM === mac && cr.ATCH_FILE_ID_3) src = cr.ATCH_FILE_ID_3; } // 폴백: 같은 모뎀 현재행
            if (src) { p.ATCH_FILE_ID_3 = src; rec({ stage: 'slave-a3-inject', mac: mac, f3: src }); }
          }
        }
      } catch (e) {}
      return orig.apply(m, arguments);
    };
    m.__sigongAddRowHook = true;
    rec({ stage: 'addrow-hook-on' });
  }
  function installHelper() {
    var vm = getAwmsVM();
    if (!vm) return false;
    if (vm.__helperInstalled) return true;
    vm.__helperInstalled = true;
    applyDeptWith(vm);
    try {
      vm.$watch('mainList.currentRow', function () { applyDeptWith(vm); });
      vm.$watch('mainList.currentRow.MAC_MODEM', function (nv) {
        try {
          // ① 기호 제거 — Code39 스캐너가 시작·종료 문자 '*' 를 붙여 보낸다(실측 6건이 별표째
          //    awms 에 저장됐다: *01253655347*). 값을 바꾸는 게 아니라 기호만 떼는 것이라 안전하다.
          //    ★대문자 변환은 하지 않는다 — 타이핑 중 커서가 튄다. 검사할 때만 대문자로 본다.
          var cleaned = String(nv || '').replace(/[\s:\-*]/g, '');
          if (cleaned !== String(nv || '')) {
            if (typeof vm.$set === 'function') vm.$set(vm.mainList.currentRow, 'MAC_MODEM', cleaned);
            else vm.mainList.currentRow.MAC_MODEM = cleaned;
            rec({ stage: 'mac-symbol-strip', from: nv, to: cleaned });
            return;   // 값이 바뀌었으니 이 watch 가 한 번 더 돈다. 거기서 검사한다.
          }
          // ② 형식 검사 — 손입력 중에는 조용하다(force=false). 자릿수가 다 차야 판정된다.
          //    QR/바코드/손입력 어느 경로로 들어오든 여기서 한 번은 걸린다(바코드는 awms 원래
          //    스캐너를 쓰므로 __onNativeScan 을 안 탄다 — 이 watch 가 유일한 그물이다).
          var __macBad = checkMacValue(cleaned, false, null);
          if (!__macBad) macOwnerCheck(vm, cleaned);   // [v87] 테스터 전용 (내부에서 게이트)
        } catch (e) {}
        setTimeout(function () { applyCommBungi(vm); }, 200);
      });
      vm.$watch('mainList.currentRow.INST_M', function () { setTimeout(function () { applyCommBungi(vm); }, 300); });
      vm.$watch('mainList.currentRow.MODEM_DIV', function () { setTimeout(function () { applyCommBungi(vm); applyMbToMeter(vm); }, 150); });
      vm.$watch('mainList.currentRow.MB_METER_ID', function () { applyMbToMeter(vm); });   // [v64] 대표계기 입력 → 계기번호 자동
      installInputChecks(vm);   // [v87] 테스터 전용 입력 검사 (감시는 걸어 두되 실행은 내부 게이트)
    } catch (e) {}
    // 헬퍼 모드에서만 저장 리스너 등록
    if (window.__awmsHelper) { installSaveListener(); installAddRowHook(vm); }
    rec({ stage: 'helper-installed' });
    return true;
  }
  // site-data 통신방식 매핑 1회 로드 (PLC/DCU 통신방식 자동선택용 — 계기번호→통신방식)
  try {
    if (!window.__commMap) {
      fetch('https://815dudwns.github.io/ami-work/data/comm-map.json', { cache: 'force-cache' })
        .then(function (r) { return r.json(); })
        .then(function (j) { window.__commMap = j; rec({ stage: 'commmap-loaded', n: Object.keys(j).length }); })
        .catch(function (e) { rec({ stage: 'commmap-fail', msg: String(e) }); });
    }
  } catch (e) {}

  try {
    var __t = 0, __iv = setInterval(function () {
      if (installHelper() || ++__t > 40) clearInterval(__iv);
    }, 1000);
  } catch (e) {}

  // 마스터 saveAct(XHR) 응답에서 시공전 파일ID 캡처 (사진은 binary 관리 → 저장 후 파일ID로만 공유 가능)
  // awms가 모뎀맥(atchFileId4) 유지하듯, 시공전(atchFileId3)을 받아 슬래이브에 참조로 넣음.
  function captureMasterPhoto(j) {
    try {
      // [v59] saveAct 응답 진단 — 어떤 필드가 오는지 + 시공전(atchFileId3) 있으면 localStorage 저장
      rec({ stage: 'saveact-resp', a3: (j && j.atchFileId3) || '-', a4: (j && j.atchFileId4) || '-', keys: j ? Object.keys(j).filter(function (k) { return /atch|file|photo|seqno/i.test(k); }).join(',') : 'null' });
      if (j && j.atchFileId3) { _setMP3(j.atchFileId3, 'saveAct'); }
    } catch (e) {}
  }
  try {
    if (!window.__xhrHooked) {   // [v59] XHR 후킹 부활 — helper는 통신팀이라 계기팀 saveRow 충돌 없음. saveAct 응답서 시공전 캡처
      window.__xhrHooked = true;
      // recorder가 window.XMLHttpRequest 생성자를 교체 + 인스턴스 메서드 래핑 → prototype 래핑은 빗나감.
      // 동일하게 생성자 래핑 + 인스턴스 메서드로 후킹 (recorder PXHR 위에 한 겹 더).
      var PrevXHR = window.XMLHttpRequest;
      function HookedXHR() {
        var x = new PrevXHR();
        var oOpen = x.open;
        x.open = function (m, u) { x.__u = u; x.__m = String(m || '').toUpperCase(); if (String(u).indexOf('saveAct') > -1) rec({ stage: 'xhr-open' }); return oOpen.apply(x, arguments); };
        var oSend = x.send;
        x.send = function (body) {
          // [v94] OTP 발송 = POST /login (authorization 빈 값 → 서버가 카톡 OTP 발송 + 401 OTP_REQUIRED).
          //   버튼·Enter 등 UI 경로와 무관하게 요청이 나가는 순간 '내가 요청자' 마킹.
          try {
            var pu = String(x.__u || '').split('?')[0];
            if (x.__m === 'POST' && /(^|\/)login$/.test(pu) && window.__markOtpReq) {
              var bs = (typeof body === 'string') ? body : '';
              if (!bs || /(^|&)authorization=(&|$)/.test(bs)) {
                window.__markOtpReq(); rec({ stage: 'otp-req-mark', btn: 'xhr-login' });
              }
            }
          } catch (eM) {}
          // [v99] 로그인 진단 — /login 응답만. 계정·OTP 값은 싣지 않는다.
          try {
            var pu2 = String(x.__u || '').split('?')[0];
            if (x.__m === 'POST' && /(^|\/)login$/.test(pu2)) {
              var withOtp = (typeof body === 'string') && /(^|&)authorization=[^&]+/.test(body);
              var t0 = Date.now();
              x.addEventListener('loadend', function () {
                try {
                  var j = null; try { j = JSON.parse(x.responseText || 'null'); } catch (eJ) {}
                  rec({ stage: 'login-res', st: x.status, withOtp: withOtp, ms: Date.now() - t0,
                        sinceFill: window.__otpFillAt ? (Date.now() - window.__otpFillAt) : -1,
                        success: j && j.success, redir: j && j.redirectUrl ? String(j.redirectUrl).slice(0, 80) : '',
                        code: j && j.errorCode ? String(j.errorCode) : '', msg: j && j.errorMessage ? String(j.errorMessage).slice(0, 40) : '',
                        page: location.pathname + (location.search ? '?' + location.search.slice(1, 40) : '') });
                } catch (eR) {}
              });
            }
          } catch (eL) {}
          if (String(x.__u || '').indexOf('saveAct') > -1) {
            rec({ stage: 'xhr-saveact' });
            x.addEventListener('loadend', function () {
              var txt = ''; try { txt = x.responseText; } catch (e) {}
              rec({ stage: 'xhr-load', len: (txt || '').length });
              try { captureMasterPhoto(JSON.parse(txt)); } catch (e) { rec({ stage: 'xhr-parse-fail', msg: String(e) }); }
            });
          }
          return oSend.apply(x, arguments);
        };
        return x;
      }
      try { for (var k in PrevXHR) { try { HookedXHR[k] = PrevXHR[k]; } catch (e) {} } } catch (e) {}
      try { HookedXHR.prototype = PrevXHR.prototype; } catch (e) {}
      window.XMLHttpRequest = HookedXHR;
    }
    // fetch도 후킹 (awms가 fetch로 saveAct 보낼 수 있음 — recorder xhr 분류와 무관하게 양쪽 커버)
    if (!window.__fetchHooked && window.fetch) {   // [v59] fetch 후킹 부활 (helper 통신팀)
      window.__fetchHooked = true;
      var _f = window.fetch;
      window.fetch = function (u) {
        var url = (u && u.url) ? u.url : String(u);
        var p = _f.apply(this, arguments);
        if (url.indexOf('saveAct') > -1) {
          rec({ stage: 'fetch-saveact' });
          p.then(function (r) { return r.clone().json(); }).then(captureMasterPhoto).catch(function (e) { rec({ stage: 'fetch-parse-fail', msg: String(e) }); });
        }
        return p;
      };
    }
  } catch (e) {}

  // 시공전 진단 — 상태 변화 시에만 firebase 기록 (매 틱 폭주 방지)
  var __lastPhotoDiag = '';
  function _photoDiag(snap) {
    if (snap === __lastPhotoDiag) return;
    __lastPhotoDiag = snap;
    rec({ stage: 'photo-diag', snap: snap });
  }
  // [v49] 시공전 기억 = localStorage (영준님 발견: 슬래이브 버튼→페이지 갱신 시 window 변수는 날아감. localStorage는 유지)
  // [v52] 폰 고유ID + 만료(5분) + 1회용 — "내가 안 한 사진"(이전 작업 잔재/다른 폰) 차단
  function _phoneId() {
    try {
      var p = localStorage.getItem('__phoneId');
      if (!p) { p = 'ph_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now(); localStorage.setItem('__phoneId', p); }
      return p;
    } catch (e) { return 'ph_x'; }
  }
  // [v55] 빈값은 절대 저장 안 함(영준님 통찰: 새 슬래이브 빈값이 저장값을 덮던 문제).
  // 폰ID 비교 제거(localStorage 자체가 기기별 — 폰ID 불일치로 읽기 차단되던 게 mp3=- 원인). 만료 30분.
  function _setMP3(v, via) {
    if (!v) return;                       // 빈값 거부 — 저장값 보호
    // [v65] 모뎀별 맵 즉시 저장 — _setMP3는 saveAct/click/mousedown 모두 통과 → polling(0.5s) 타이밍 독립.
    // (이 시점 currentRow=마스터, MAC_MODEM 있음. polling만 채우던 v63/v64는 빨리 슬래이브 추가 시 놓쳤음)
    try { var _vm = getAwmsVM(); var _mac = _vm && _vm.mainList && _vm.mainList.currentRow && _vm.mainList.currentRow.MAC_MODEM; if (_mac) { window.__sigongMap = window.__sigongMap || {}; window.__sigongMap[_mac] = v; } } catch (e) {}
    if (v === window.__lastInjected) return; // [v56] 방금 주입한 값 재저장 차단 — 옛 사진 무한전파 방지
    if (_getMP3() === v) return;          // [v60] 이미 같은 값이면 저장/로그 안 함 — 폭주 방지
    window.__masterPhoto3 = v;
    try { localStorage.setItem('__mp3', JSON.stringify({ ph: _phoneId(), f3: v, ts: Date.now() })); } catch (e) {}
    rec({ stage: 'master-photo-saved', via: via || '?', f3: v }); // [v60] 실제 저장 성공 시에만 로그
  }
  function _getMP3() {
    try {
      var raw = localStorage.getItem('__mp3'); if (!raw) return '';
      var o = JSON.parse(raw);
      if (!o) return '';
      if (Date.now() - (o.ts || 0) > 1800000) return ''; // 30분 만료 (폰ID 비교는 제거 — 읽기 차단 원인)
      return o.f3 || '';
    } catch (e) { return ''; }
  }
  function _clearMP3() { window.__masterPhoto3 = ''; try { localStorage.removeItem('__mp3'); } catch (e) {} }
  // [v51] 영준님 프로세스 1번: 슬래이브 추가 버튼 누르는 순간(=마스터 폼 살아있는 마지막 시점)에
  // 마스터 시공전(ATCH_FILE_ID_3)을 localStorage에 저장. polling이 놓치는 타이밍을 클릭으로 확정.
  try {
    document.addEventListener('click', function () {
      try {
        var vm = getAwmsVM();
        var r = vm && vm.mainList && vm.mainList.currentRow;
        if (!r) { rec({ stage: 'row-dump', md: 'norow', vmSame: (window.__pvm === vm) }); window.__pvm = vm; return; }
        var md = String(r.MODEM_DIV || '');
        // [v54 진단] 클릭 순간 currentRow 전체 + vm/row 동일성(유령 vm 확인). 고치는 게 아니라 사진 실제 위치 파악.
        rec({
          stage: 'row-dump', md: md,
          a3: r.ATCH_FILE_ID_3 || '-',
          vmSame: (window.__pvm === vm), rowSame: (window.__prow === r),
          pkeys: Object.keys(r).filter(function (k) { return /atch|file|photo|img/i.test(k); }).join(','),
          row: JSON.stringify(r).slice(0, 1300)
        });
        window.__pvm = vm; window.__prow = r;
        // [v56] MD 구분 제거 — 영준님 작업폼은 전부 MD=20(MD=10 없음 확인). 클릭 순간 A3 있으면 저장.
        if (r.ATCH_FILE_ID_3) {
          _setMP3(r.ATCH_FILE_ID_3, 'click'); // [v60] 중복/로그는 _setMP3가 처리
        }
      } catch (e) { rec({ stage: 'row-dump-err', e: String(e && e.message || e) }); }
    }, true);
  } catch (e) {}
  // [v57] 영준님 통찰: 슬래이브 추가 click이 페이지를 넘겨서 click 시점엔 이미 빈 폼.
  // → click보다 먼저 일어나는 mousedown/touchstart에서 원본 시공전(A3)을 미리 잡는다(페이지 전환 직전).
  try {
    ['mousedown', 'touchstart'].forEach(function (ev) {
      document.addEventListener(ev, function () {
        try {
          var vm = getAwmsVM();
          var r = vm && vm.mainList && vm.mainList.currentRow;
          if (r && r.ATCH_FILE_ID_3) { _setMP3(r.ATCH_FILE_ID_3, ev); } // [v60] 중복/로그는 _setMP3가 처리
        } catch (e) {}
      }, true);
    });
  } catch (e) {}
  // 사진 공유 polling — 슬래이브 시공전 칸이 비면 마스터 저장 파일ID로 채움 (미리보기도 파일ID로 표시됨)
  try {
    setInterval(function () {
      try {
        applyDeptSelect();
      } catch (e) {}
      try {
        applyBulgaHelper();   // [v95] 설치불가/철거관리 — 모뎀 기본 + 헬퍼 설정 지사
      } catch (e) {}
      try {
        var vm = getAwmsVM();
        if (!vm || !vm.mainList) { _photoDiag('no-vm'); return; }
        var r = vm.mainList.currentRow;
        if (!r) { _photoDiag('no-currentRow'); return; }
        var md = String(r.MODEM_DIV || '');
        var mp3 = _getMP3();
        // 진단: 상태 변화 시에만 firebase 기록 (매 틱 폭주 방지) + 마스터의 모든 ATCH 슬롯
        _photoDiag('MD=' + md + '|A3=' + (r.ATCH_FILE_ID_3 || '-') + '|A4=' + (r.ATCH_FILE_ID_4 || '-') + '|A5=' + (r.ATCH_FILE_ID_5 || '-') + '|A6=' + (r.ATCH_FILE_ID_6 || '-') + '|mp3=' + (mp3 || '-'));
        // [v63] 캡처: 마스터 시공전을 모뎀별 맵(__sigongMap[MAC_MODEM])에 저장 → addRow 후킹이 param.MAC_MODEM으로 조회(cross-modem 안전)
        if (r.ATCH_FILE_ID_3) {
          _setMP3(r.ATCH_FILE_ID_3, 'poll'); // 호환 유지
          if (r.MAC_MODEM) { window.__sigongMap = window.__sigongMap || {}; window.__sigongMap[r.MAC_MODEM] = r.ATCH_FILE_ID_3; }
        }
        // [v63] mainList 재생성 대비 addRow 후킹 재확인
        try { installAddRowHook(vm); } catch (e) {}
        // [v63] 미리보기 지속: A3 데이터 있으나 img.src가 플레이스홀더면 singleFile URL로 세팅.
        //       (awms는 A4 미리보기만 관리/복원 → A3는 우리가 매 틱 유지해야 행 전환 후에도 사진이 뜸. 영준님 "미리보기까지 떠야")
        try {
          if (r.ATCH_FILE_ID_3) {
            var _img3 = document.getElementById('ATCH_FILE3_IMG');
            if (_img3 && String(_img3.src || '').indexOf('singleFile') < 0) {
              _img3.src = 'https://awms.kdn.com/singleFile.innorix?atchFileId=' + r.ATCH_FILE_ID_3;
            }
          }
        } catch (e) {}
        // [v66] late-injection 부활 — 한버튼/서버랙으로 addRow 시점에 시공전ID가 아직 없던 슬래이브를
        //   saveAct 응답 후(=__sigongMap 채워진 후) setRow로 채움. v62 polling 주입을 callback 대신 setRow로 복원.
        //   (v63에서 통째 제거한 게 새 임의추가 회귀 원인. callback=innorix 부작용만 문제였고 개념은 옳았음)
        //   모뎀별 맵으로 cross-modem 안전. 행별 1회 시도(__a3tried)로 폭주/재시도 방지.
        try {
          if (String(r.MODEM_DIV || '') === '20' && !r.ATCH_FILE_ID_3 && !r.__a3tried) {
            var _lm = r.MAC_MODEM || '';
            var _ls = (_lm && window.__sigongMap && window.__sigongMap[_lm]) || '';
            if (_ls) {
              r.__a3tried = true;                       // 행별 1회만 (덮어써도 무한재시도 방지)
              setRow(vm, r, 'ATCH_FILE_ID_3', _ls);     // setRow=빈칸만, innorix callback 아님
              rec({ stage: 'slave-a3-inject', via: 'poll-late', mac: _lm, f3: _ls });
            }
          }
        } catch (e) {}
      } catch (e) {}
    }, 500);
  } catch (e) {}

  // ── 진단: innorix 사진 업로드 흐름 (멀티 4장 → ATCH_FILE 3/4/5/6 순서 배분 구현용) ──
  try {
    // 사진칸 클릭 시 file input 구조 덤프 (multiple/accept/id 파악)
    document.addEventListener('click', function (e) {
      try {
        var t = e.target;
        var near = t && t.closest && t.closest('[id*=ATCH],[id*=atch],[class*=upload],[class*=innorix],[class*=file],[class*=photo],[class*=img]');
        if (!(t && (t.type === 'file' || near))) return;
        var ins = document.querySelectorAll('input[type=file]');
        console.log('[FILEINPUT] count=' + ins.length);
        ins.forEach(function (inp, i) {
          console.log('[FILEINPUT] ' + i + ' id=' + inp.id + ' name=' + inp.name + ' multiple=' + inp.multiple + ' accept=' + inp.accept + ' cls=' + inp.className + ' parentcls=' + (inp.parentElement && inp.parentElement.className));
        });
      } catch (_) {}
    }, true);
    // [v48] file input change 감지 — 앨범/카메라 사진이 awms input까지 도달하는지 firebase 기록
    document.addEventListener('change', function (e) {
      try {
        if (e.target && e.target.type === 'file') {
          rec({ stage: 'file-change', id: e.target.id || '', name: e.target.name || '', n: e.target.files ? e.target.files.length : 0 });
        }
      } catch (_) {}
    }, true);
    // innorix 업로드 완료 콜백 래핑 → 호출 인자(파일ID/슬롯) logcat. vm 갱신 대비 주기 재시도.
    setInterval(function () {
      try {
        var vm = getAwmsVM(); if (!vm) return;
        if (typeof vm.innorixFileUploadSingleCallback === 'function' && !vm.__innorixCbWrapped) {
          var _o = vm.innorixFileUploadSingleCallback.bind(vm);
          vm.innorixFileUploadSingleCallback = function (a) {
            try { console.log('[INNORIX-CB] ' + JSON.stringify(a)); } catch (_) { console.log('[INNORIX-CB] id=' + (a && a.id) + ' fid=' + (a && a.ATCH_FILE_ID)); }
            // [v48] 업로드 콜백 어느 id/파일ID인지 + 직후 currentRow ATCH 전부 firebase
            try {
              rec({ stage: 'innorix-cb', id: a && a.id, fid: a && a.ATCH_FILE_ID, st: a && a.status });
              var rr = vm.mainList && vm.mainList.currentRow;
              if (rr) rec({ stage: 'inx-row', a3: rr.ATCH_FILE_ID_3 || '-', a4: rr.ATCH_FILE_ID_4 || '-', a5: rr.ATCH_FILE_ID_5 || '-', a6: rr.ATCH_FILE_ID_6 || '-', md: rr.MODEM_DIV });
            } catch (_) {}
            return _o(a);
          };
          vm.__innorixCbWrapped = true;
          console.log('[INNORIX] cb wrapped; related fns: ' + Object.keys(vm).filter(function (k) { return /innorix|upload|file|atch/i.test(k); }).join(','));
          // [v48] vm의 사진 관련 필드명 목록 firebase (ATCH_FILE_ID_3가 맞는 키인지 확인용)
          try { rec({ stage: 'inx-keys', keys: Object.keys(vm.mainList && vm.mainList.currentRow || {}).filter(function (k) { return /atch|file|photo|img/i.test(k); }).join(',') }); } catch (_) {}
        }
        // upload / updateAtachFile 래핑 → 4장이 어떻게 처리되는지 인자 logcat
        if (typeof vm.upload === 'function' && !vm.__inxUploadWrapped) {
          var _up = vm.upload.bind(vm);
          vm.upload = function () {
            try { console.log('[INX-upload] args=' + JSON.stringify([].slice.call(arguments)).slice(0, 600)); } catch (_) { console.log('[INX-upload] (args unserializable) n=' + arguments.length); }
            return _up.apply(this, arguments);
          };
          vm.__inxUploadWrapped = true;
          console.log('[INX-upload] toString=' + String(_up).replace(/\s+/g, ' ').slice(0, 500));
        }
        if (typeof vm.updateAtachFile === 'function' && !vm.__inxUpdWrapped) {
          var _ua = vm.updateAtachFile.bind(vm);
          vm.updateAtachFile = function () {
            try { console.log('[INX-updAtach] args=' + JSON.stringify([].slice.call(arguments)).slice(0, 600)); } catch (_) { console.log('[INX-updAtach] (args unserializable) n=' + arguments.length); }
            var ret = _ua.apply(this, arguments);
            try { var r = vm.mainList && vm.mainList.currentRow; if (r) console.log('[INX-row] 3=' + r.ATCH_FILE_ID_3 + ' 4=' + r.ATCH_FILE_ID_4 + ' 5=' + r.ATCH_FILE_ID_5 + ' 6=' + r.ATCH_FILE_ID_6); } catch (_) {}
            return ret;
          };
          vm.__inxUpdWrapped = true;
          console.log('[INX-updAtach] toString=' + String(_ua).replace(/\s+/g, ' ').slice(0, 500));
        }
        // fileFields / uploadTarget / uploadResolvers 구조 1회 덤프
        if (vm.__innorixCbWrapped && !vm.__inxDumped) {
          try { console.log('[INX-fileFields] ' + JSON.stringify(vm.fileFields).slice(0, 800)); } catch (_) {}
          try { console.log('[INX-uploadTarget] ' + JSON.stringify(vm.uploadTarget).slice(0, 400)); } catch (_) {}
          try { console.log('[INX-uploadResolvers] keys=' + JSON.stringify(Object.keys(vm.uploadResolvers || {}))); } catch (_) {}
          vm.__inxDumped = true;
        }
        // [핵심] 업로드 후 파일ID 저장 위치/개수 추적 — 4장 올리면 몇 개 생기나
        try {
          var r = vm.mainList && vm.mainList.currentRow;
          if (r) {
            var snap = '3=' + r.ATCH_FILE_ID_3 + '|4=' + r.ATCH_FILE_ID_4 + '|5=' + r.ATCH_FILE_ID_5 + '|6=' + r.ATCH_FILE_ID_6;
            if (snap !== window.__lastAtchSnap) {
              window.__lastAtchSnap = snap;
              console.log('[ATCH-SNAP] ' + snap);
              for (var k in r) { if (/ATCH|FILE|atch|file|img|photo|사진/i.test(k)) { try { console.log('[ROW-KEY] ' + k + '=' + JSON.stringify(r[k]).slice(0, 250)); } catch (_) {} } }
              for (var vk in vm) { try { var vv = vm[vk]; if (Array.isArray(vv) && vv.length && vv.length < 50 && /file|atch|name|id|sn|seq/i.test(JSON.stringify(vv[0] || {}))) console.log('[VM-ARR] ' + vk + ' n=' + vv.length + ' ' + JSON.stringify(vv).slice(0, 350)); } catch (_) {} }
            }
          }
        } catch (_) {}
      } catch (_) {}
    }, 1500);
  } catch (e) {}

  // [로고 추출] awms 로고 이미지/배경이미지 URL 덤프 (설정페이지 디자인용) — 1회
  try {
    setTimeout(function () {
      try {
        if (window.__logoDumped) return; window.__logoDumped = true;
        document.querySelectorAll('img').forEach(function (img) {
          if (img.naturalWidth > 25) console.log('[IMG] ' + img.naturalWidth + 'x' + img.naturalHeight + ' alt=' + (img.alt || '') + ' cls=' + (img.className || '') + ' ' + img.src);
        });
        document.querySelectorAll('[class*=logo],[id*=logo],[class*=Logo],header,.header,[class*=top],[class*=brand],[class*=ci]').forEach(function (el) {
          try { var bg = getComputedStyle(el).backgroundImage; if (bg && bg !== 'none') console.log('[BGIMG] ' + (el.id || el.className || el.tagName) + ' ' + bg.slice(0, 250)); } catch (_) {}
        });
      } catch (_) {}
    }, 1800);
  } catch (e) {}

  // OCR 카메라 광각→일반 후킹. awms OCR(ocr-reader-warebiz)이 facingMode:environment로 요청 시
  // 일반 후면 렌즈 deviceId로 교체(영준님 폰 광각 깨짐 회피). QR/바코드는 네이티브 스캐너라 무관.
  function pickNormalBackCamera(devices) {
    var back = devices.filter(function (d) { return d.kind === 'videoinput' && /back|후면/i.test(d.label); });
    var n = back.find(function (d) { return d.label.trim() === '후면 카메라'; });                       // iOS 일반
    if (!n) n = back.find(function (d) { return /(^|[^0-9])0(,|\s|$)/.test(d.label) && /back/i.test(d.label); }); // 안드 camera 0
    if (!n) n = back.find(function (d) { return /camera\s*0\b/i.test(d.label); });
    return n || back[0] || null;
  }
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && !window.__camHooked) {
      window.__camHooked = true;
      var _gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = function (constraints) {
        return (async function () {
          try {
            var v = constraints && constraints.video;
            var facing = v && (v.facingMode === 'environment' || (v.facingMode && v.facingMode.exact === 'environment'));
            var isFront = v && (v.facingMode === 'user' || (v.facingMode && v.facingMode.exact === 'user'));
            var wantsBack = v === true || facing || (v && typeof v === 'object');
            if (wantsBack && !isFront) {
              var tmp = null;
              try { tmp = await _gum({ video: { facingMode: 'environment' }, audio: false }); } catch (e) {}
              var devices = await navigator.mediaDevices.enumerateDevices();
              if (tmp) tmp.getTracks().forEach(function (t) { t.stop(); });
              var chosen = null;
              // __helperCam 우선: 헬퍼 앱이 주입한 카메라 선택값(deviceId/label). awms-bridge는 미주입 → 자동 폴백.
              if (window.__helperCam && (window.__helperCam.deviceId || window.__helperCam.label)) {
                var hc = window.__helperCam;
                var vdevs = devices.filter(function (d) { return d.kind === 'videoinput'; });
                // 1순위: deviceId 정확 일치
                if (hc.deviceId) { chosen = vdevs.find(function (d) { return d.deviceId === hc.deviceId; }) || null; }
                // 2순위: label 일치
                if (!chosen && hc.label) { chosen = vdevs.find(function (d) { return d.label === hc.label; }) || null; }
                if (chosen) { rec({ stage: 'cam-hook-helperCam', label: chosen.label }); }
                else { rec({ stage: 'cam-hook-helperCam-nomatch', wanted: hc }); }
              }
              // __helperCam 없거나 매칭 실패 → 기존 pickNormalBackCamera 폴백
              var normal = chosen || pickNormalBackCamera(devices);
              if (normal) {
                var nv = (typeof v === 'object' && v) ? Object.assign({}, v) : {};
                delete nv.facingMode;
                nv.deviceId = { exact: normal.deviceId };
                if (!chosen) rec({ stage: 'cam-hook', label: normal.label });
                return _gum(Object.assign({}, constraints, { video: nv }));
              }
            }
          } catch (e) { rec({ stage: 'cam-hook-err', msg: String(e) }); }
          return _gum(constraints);
        })();
      };
    }
  } catch (e) {}

  // ── [v79] 헬퍼 ⌂(홈) 버튼: awms를 떠나 재로딩하던 문제 해결 ──────────────
  //   기존: ⌂ → location.href='https://localhost/' → awms 통째 언로드 → 재진입 시 전체 재로딩(느림).
  //   변경: ⌂ → awms는 그대로 둔 채 홈 오버레이만 띄움. "AWMS로 돌아가기" = 오버레이 닫기(재로딩 0).
  //   헬퍼 전용(window.AndroidNav 게이트) — 아미큐/계기큐(AwmsQ/AwmsResult)엔 ⌂ 없고 미적용.
  try {
    if (window.AndroidNav) {
      var openHelperHome = function () {
        if (document.getElementById('__helper_home')) return;
        var ov = document.createElement('div');
        ov.id = '__helper_home';
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:linear-gradient(160deg,#1e3a8a,#0f172a);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#fff;padding:env(safe-area-inset-top,0) 24px env(safe-area-inset-bottom,0);box-sizing:border-box;';
        var t = document.createElement('div');
        t.textContent = 'AWMS 헬퍼';
        t.style.cssText = 'font-size:26px;font-weight:800;letter-spacing:0.5px;';
        var s = document.createElement('div');
        s.textContent = '작업 화면은 그대로 유지됩니다';
        s.style.cssText = 'font-size:13px;opacity:0.72;margin-top:-10px;';
        var back = document.createElement('button');
        back.textContent = 'AWMS로 돌아가기';
        back.style.cssText = 'background:#fff;color:#1e3a8a;border:none;border-radius:14px;padding:18px 40px;font-size:19px;font-weight:800;box-shadow:0 6px 20px rgba(0,0,0,0.35);';
        back.onclick = function () { ov.remove(); };
        var setBtn = document.createElement('button');
        setBtn.textContent = '설정 열기 (앱 재시작)';
        setBtn.style.cssText = 'background:transparent;color:#cbd5e1;border:1px solid rgba(255,255,255,0.3);border-radius:12px;padding:11px 26px;font-size:13px;';
        setBtn.onclick = function () { window.location.href = 'https://localhost/'; };
        ov.appendChild(t); ov.appendChild(s); ov.appendChild(back);
        // [v97] 자재관리 — v100 부터 전 작업자
        try {
          if (window.__stockTester && window.__stockTester()) {
            var stkBtn = document.createElement('button');
            stkBtn.textContent = '자재 현황';
            stkBtn.style.cssText = 'background:#175cd3;color:#fff;border:none;border-radius:14px;padding:14px 40px;font-size:17px;font-weight:800;';
            stkBtn.onclick = function () { if (window.__openStockPage) window.__openStockPage(); };
            ov.appendChild(stkBtn);
          }
        } catch (e) {}
        ov.appendChild(setBtn);
        document.body.appendChild(ov);
      };
      window.__openHelperHome = openHelperHome;
      var rebindHome = function () {
        var bar = document.getElementById('__bridge_toolbar');
        if (!bar) return false;
        var btns = bar.querySelectorAll('button');
        var found = false;
        for (var i = 0; i < btns.length; i++) {
          if (btns[i].textContent === '⌂' && !btns[i].__homeRebound) {  // ⌂
            btns[i].__homeRebound = true;
            btns[i].onclick = function (e) { if (e) e.preventDefault(); openHelperHome(); };
            found = true;
          }
        }
        return found;
      };
      var _t = 0, _iv = setInterval(function () { _t++; if (rebindHome() || _t > 25) clearInterval(_iv); }, 300);
    }
  } catch (e) {}

  // [v86] Tester gate — features under test run only for the accounts listed here.
  //   Everyone loads this same file from GitHub, so new behaviour must check this first.
  var TESTER_IDS = ['273584'];   // 우영준
  var __testerState = null;      // null = not known yet (awms screen not ready)
  function __isTester() {
    if (__testerState !== null) return __testerState;
    try {
      var vm = getAwmsVM();
      var s = vm && (vm.session || (vm.$root && vm.$root.session));
      if (!s || !s.USER_ID) return false;   // unknown yet — ask again later
      __testerState = TESTER_IDS.indexOf(String(s.USER_ID)) > -1;
      rec({ stage: 'tester-gate', id: String(s.USER_ID), on: __testerState });
    } catch (e) { return false; }
    return __testerState;
  }
  window.__isTester = __isTester;
  // [v89] v86~v88 checks released to every helper user (영준님 2026-10-20). New experiments stay
  //   behind __isTester() directly; __featOn() = released features.
  function __featOn() { return FEAT_RELEASED || __isTester(); }


  // ===== [v87] Tester-only input checks =====
  //   meter number: law check + membership in the map lists (data/meter-list-index.json)
  //   modem MAC: own-material check against awms (GET selectBarcdQr, read only)
  //   Never blocks saving. Everything is behind __featOn().
  var LIST_NAMES = { s: '실효', h: '합동', m: '25미청구', u: '25불가', j: '장애', g: '고압', k: 'SKT', p: '선조치' };
  // [v93] 인덱스가 이름표(__names)를 같이 싣는다 — 새 리스트도 inject 를 고치지 않고 이름으로 뜬다.
  var __meterIdx = null, __meterIdxLoading = false, __meterIdxFail = false;
  function loadMeterIndex(cb) {
    if (__meterIdx) { cb(); return; }
    if (__meterIdxFail) return;
    if (__meterIdxLoading) { setTimeout(function () { loadMeterIndex(cb); }, 500); return; }
    __meterIdxLoading = true;
    fetch('https://815dudwns.github.io/ami-work/data/meter-list-index.json', { cache: 'no-cache' })   // [v92] force-cache 는 옛 리스트를 계속 썼다 — 매번 ETag 재확인(안 바뀌면 304)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.__names && typeof j.__names === 'object') { for (var c in j.__names) if (j.__names[c]) LIST_NAMES[c] = j.__names[c]; delete j.__names; }
        __meterIdx = j; __meterIdxLoading = false; rec({ stage: 'meteridx-loaded', n: Object.keys(j).length }); cb(); })
      .catch(function (e) { __meterIdxLoading = false; __meterIdxFail = true; rec({ stage: 'meteridx-fail', msg: String(e) }); });
  }
  var CHK_COLOR = { ok: '#067647', warn: '#b54708', err: '#d92d20' };
  function visibleInputByName(name) {
    var list = document.querySelectorAll('input[name="' + name + '"]');
    for (var i = 0; i < list.length; i++) if (isVisibleInput(list[i])) return list[i];
    return list.length ? list[0] : null;
  }
  // level: 'ok' | 'warn' | 'err' | '' (clear)
  function showChk(field, level, text) {
    try {
      var old = document.querySelectorAll('[data-awchk="' + field + '"]');
      for (var i = 0; i < old.length; i++) if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
      var input = visibleInputByName(NAME_BY_FIELD[field]);
      if (!input) return;
      if (!level) { input.style.removeProperty('border'); return; }
      var c = CHK_COLOR[level];
      input.style.setProperty('border', '2px solid ' + c, 'important');
      var d = document.createElement('div');
      d.setAttribute('data-awchk', field);
      d.style.cssText = 'font-size:13px;line-height:1.3;margin-top:2px;font-weight:600;color:' + c;
      d.textContent = text;
      if (input.parentNode) input.parentNode.insertBefore(d, input.nextSibling);
    } catch (e) {}
  }
  // [v88] 25미청구 list meter -> put '25' in 비고(ETC1). Removed again only if we added it and the
  //   meter number changes to one outside that list. Text the worker typed is kept.
  var __auto25 = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
  function tag25(vm, row, codes) {
    try {
      if (!row || !__auto25) return;
      var in25 = !!codes && codes.indexOf('m') >= 0;
      var etc = String(row.ETC1 == null ? '' : row.ETC1);
      var tagged = /(^|\s)25(\s|$)/.test(etc);
      var nv = null;
      if (in25 && !tagged) { nv = etc ? '25 ' + etc : '25'; __auto25.set(row, 1); rec({ stage: 'etc25-auto', meter: row.INSTR_NUM || '', etc: nv }); }
      else if (!in25 && tagged && __auto25.has(row)) {
        nv = etc.replace(/(^|\s)25(\s|$)/, ' ').replace(/^\s+|\s+$/g, '');
        __auto25['delete'](row); rec({ stage: 'etc25-clear', meter: row.INSTR_NUM || '', etc: nv });
      }
      if (nv !== null) { if (typeof vm.$set === 'function') vm.$set(row, 'ETC1', nv); else row.ETC1 = nv; }
    } catch (e) {}
  }
  function evalMeterField(vm, field) {
    try {
      if (!__featOn()) return;
      var row = vm && vm.mainList && vm.mainList.currentRow;
      var v = row ? String(row[field] == null ? '' : row[field]).replace(/[\s\-]/g, '').toUpperCase() : '';
      if (v.length < 11) { showChk(field, '', ''); if (field === 'INSTR_NUM') clearJisa(); return; }       // silent until 11 chars
      if (!/^[0-9A-Z]{2}[0-9]{9}$/.test(v)) { if (field === 'INSTR_NUM') { tag25(vm, row, ''); clearJisa(); } showChk(field, 'err', '계기번호 형식 오류'); rec({ stage: 'meter-chk', f: field, v: v, r: 'law' }); return; }
      if (field === 'INSTR_NUM') jisaCheck(vm, row, v);
      loadMeterIndex(function () {
        var cur = vm.mainList.currentRow;
        var now = cur ? String(cur[field] == null ? '' : cur[field]).replace(/[\s\-]/g, '').toUpperCase() : '';
        if (now !== v) return;                                    // value changed while loading
        var codes = __meterIdx[v];
        if (field === 'INSTR_NUM') tag25(vm, cur, codes);
        if (codes) {
          var names = [];
          for (var i = 0; i < codes.length; i++) names.push(LIST_NAMES[codes.charAt(i)] || codes.charAt(i));
          showChk(field, 'ok', names.join(' · '));
        } else showChk(field, 'warn', '지도 리스트에 없음');
        rec({ stage: 'meter-chk', f: field, v: v, r: codes || '-' });
      });
    } catch (e) {}
  }
  // ===== [v96] 리스트 지사 안내 (영준님 2026-11-13 "계기번호 넣는 순간 리스트 지사와 다르면 변경 메시지") =====
  //   그 계기가 든 지도 리스트 행의 지사(data/meter-jisa-index.json — {__depts:{DEPT2:이름}, DEPT2:"계기,계기,..."})가
  //   지금 행 지사(currentRow.DEPT2)와 다르면 계기번호 칸 밑에 안내 + [X 로 바꾸기]. 누르면 v88 지사 강제와 같은 길
  //   (vm.$set(row,'DEPT2')) — 저장 body 는 currentRow 라 따라간다. 저장을 막지 않는다.
  //   안 띄우는 행: 저장된 행(REG_DATE) · 슬레이브(MODEM_DIV 20 — 마스터 지사를 따른다).
  //   [v98] 전 작업자 공개 — __featOn (영준님 2026-11-15 "지사 알려주기는 전체"). v96~v97 은 테스터 전용이었다.
  var __jisaIdx = null, __jisaLoading = false, __jisaFail = false, __jisaNames = {};
  function loadJisaIndex(cb) {
    if (__jisaIdx) { cb(); return; }
    if (__jisaFail) return;
    if (__jisaLoading) { setTimeout(function () { loadJisaIndex(cb); }, 500); return; }
    __jisaLoading = true;
    fetch('https://815dudwns.github.io/ami-work/data/meter-jisa-index.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (j) {
        var idx = {};
        __jisaNames = (j && j.__depts) || {};
        for (var k in j) if (k.charAt(0) !== '_' && typeof j[k] === 'string') idx[k] = ',' + j[k] + ',';   // 찾기는 indexOf — 18만 키 객체를 안 만든다
        __jisaIdx = idx; __jisaLoading = false; rec({ stage: 'jisaidx-loaded', n: Object.keys(idx).length }); cb();
      })
      .catch(function (e) { __jisaLoading = false; __jisaFail = true; rec({ stage: 'jisaidx-fail', msg: String(e) }); });
  }
  function jisaOfMeter(v) {
    var out = [];
    for (var code in __jisaIdx) if (__jisaIdx[code].indexOf(',' + v + ',') >= 0) out.push(code);
    return out;
  }
  function jisaName(code) { return __jisaNames[code] || code || '(없음)'; }
  // 박스 자리 — 계기번호 칸은 DIV.flex(칸·라벨·[인식]) 안이라 그 안에 넣으면 옆으로 눌린다. 그 줄 밑(같은 TD)에 둔다.
  function jisaPlace(el) {
    var input = visibleInputByName(NAME_BY_FIELD.INSTR_NUM);
    if (!input || !input.parentNode) return false;
    var box = input.parentNode;
    var flex = box.parentNode && getComputedStyle(box).display.indexOf('flex') >= 0;
    if (flex) box.parentNode.insertBefore(el, box.nextSibling);
    else {
      var after = input.nextSibling;
      while (after && after.getAttribute && after.getAttribute('data-awchk')) after = after.nextSibling;
      input.parentNode.insertBefore(el, after);
    }
    return true;
  }
  function clearJisa() {
    try { var old = document.querySelectorAll('[data-awchk="JISA"]'); for (var i = 0; i < old.length; i++) if (old[i].parentNode) old[i].parentNode.removeChild(old[i]); } catch (e) {}
  }
  function showJisa(vm, row, v, codes) {
    clearJisa();
    var d = document.createElement('div');
    d.setAttribute('data-awchk', 'JISA');
    d.style.cssText = 'font-size:13px;line-height:1.35;margin-top:4px;padding:6px 8px;border:2px solid ' + CHK_COLOR.warn + ';border-radius:6px;color:' + CHK_COLOR.warn + ';font-weight:600;background:#fffaeb';
    var t = document.createElement('div');
    t.textContent = '리스트 지사 ' + codes.map(jisaName).join(' · ') + ' — 지금 ' + jisaName(String(row.DEPT2 || ''));
    d.appendChild(t);
    codes.forEach(function (code) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = jisaName(code) + ' 로 바꾸기';
      b.style.cssText = 'margin:6px 6px 0 0;padding:6px 10px;font-size:13px;font-weight:700;border-radius:6px;border:1px solid ' + CHK_COLOR.warn + ';background:#fff;color:' + CHK_COLOR.warn;
      b.addEventListener('click', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var cur = vm.mainList && vm.mainList.currentRow;
        if (cur !== row || cur.REG_DATE) { clearJisa(); return; }        // 다른 행으로 넘어갔거나 저장됨
        var before = String(row.DEPT2 || '');
        if (typeof vm.$set === 'function') vm.$set(row, 'DEPT2', code); else row.DEPT2 = code;
        if (__deptForced) __deptForced.set(row, 1);                       // v88 강제가 다시 덮지 않게
        rec({ stage: 'jisa-change', meter: v, before: before, dept: code });
        clearJisa();
        var ok = document.createElement('div');
        ok.setAttribute('data-awchk', 'JISA');
        ok.style.cssText = 'font-size:13px;margin-top:2px;font-weight:600;color:' + CHK_COLOR.ok;
        ok.textContent = '지사를 ' + jisaName(code) + ' 로 바꿨습니다';
        jisaPlace(ok);
        setTimeout(function () { if (ok.parentNode) ok.parentNode.removeChild(ok); }, 4000);
      });
      d.appendChild(b);
    });
    jisaPlace(d);
  }
  function jisaCheck(vm, row, v) {
    try {
      if (!__featOn()) return;   // [v98] 전 작업자 공개(영준님 2026-11-15)
      if (!row || row.REG_DATE || String(row.MODEM_DIV || '') === '20') { clearJisa(); return; }
      loadJisaIndex(function () {
        var cur = vm.mainList && vm.mainList.currentRow;
        var now = cur ? String(cur.INSTR_NUM == null ? '' : cur.INSTR_NUM).replace(/[\s\-]/g, '').toUpperCase() : '';
        if (cur !== row || now !== v) return;                             // 값·행이 바뀌었다
        var codes = jisaOfMeter(v);
        var dept = String(row.DEPT2 || '');
        if (!codes.length || codes.indexOf(dept) >= 0) { clearJisa(); rec({ stage: 'jisa-chk', meter: v, list: codes.join(','), dept: dept, r: codes.length ? 'same' : 'none' }); return; }
        showJisa(vm, row, v, codes);
        rec({ stage: 'jisa-chk', meter: v, list: codes.join(','), dept: dept, r: 'diff' });
      });
    } catch (e) {}
  }

  var __macChkSeq = 0;
  function macOwnerCheck(vm, mac) {
    try {
      if (!__featOn()) return;
      var row = vm && vm.mainList && vm.mainList.currentRow;
      var wd = row ? String(row.WORK_DIV || '') : '';
      if (wd === 'M1030') { showChk('MAC_MODEM', '', ''); return; }   // 기설: 합류 모뎀이라 검사 안 함
      var m = String(mac || '').toUpperCase();
      if (!/^(\d{11}|[0-9A-F]{12})$/.test(m)) { showChk('MAC_MODEM', '', ''); return; }   // [v90] 11자리 LTE + 12자리 PLC(hex, 대문자로 조회해야 나온다 — 소문자는 빈 응답, 실측 8472070DA335)
      var seq = ++__macChkSeq;
      var s = vm.session || (vm.$root && vm.$root.session) || {};
      var me = String(s.USER_ID || '');
      fetch('/ami/mob/mtl/mobMtl4000/selectBarcdQr?vFclCl=M&vUnitCode=10&vBarcdQr=' + encodeURIComponent(m),
        { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (seq !== __macChkSeq) return;                         // newer value in flight
          var cur = vm.mainList.currentRow;
          if (!cur || String(cur.MAC_MODEM || '').replace(/[\s:\-*]/g, '').toUpperCase() !== m) return;
          var it = (j && j.length) ? j[0] : (j && !j.length && typeof j === 'object' && j.MTRL_USER_ID !== undefined ? j : null);
          var owner = it ? String(it.MTRL_USER_ID || '') : '';
          var code = it ? String(it.WRHSG_SHP_CL_CD || '') : '';
          if (!owner) showChk('MAC_MODEM', 'err', '자재 기록 없음');
          else if (code === '50') showChk('MAC_MODEM', 'warn', owner === me ? '이미 시공된 자재' : '이미 시공된 자재 · ' + owner);
          else if (owner === me) showChk('MAC_MODEM', 'ok', '내 자재');
          else showChk('MAC_MODEM', 'warn', '다른 사람 자재 · ' + owner);
          rec({ stage: 'mac-owner', mac: m, owner: owner, code: code, sts: it ? it.MTRL_STS_CL_CD : '', wd: wd });
        })
        .catch(function (e) { rec({ stage: 'mac-owner-fail', msg: String(e) }); });
    } catch (e) {}
  }
  function installInputChecks(vm) {
    var f = function (field) {
      return function () { setTimeout(function () { evalMeterField(vm, field); }, 120); };
    };
    vm.$watch('mainList.currentRow.INSTR_NUM', f('INSTR_NUM'));
    vm.$watch('mainList.currentRow.MB_METER_ID', f('MB_METER_ID'));
    // [v96] 지사를 손으로 바꾸면 안내를 다시 판정(맞으면 사라진다)
    vm.$watch('mainList.currentRow.DEPT2', function () { setTimeout(function () { if (__featOn()) evalMeterField(vm, 'INSTR_NUM'); }, 150); });
    vm.$watch('mainList.currentRow', function () {
      setTimeout(function () {
        if (!__featOn()) return;
        ['INSTR_NUM', 'MB_METER_ID'].forEach(function (k) { evalMeterField(vm, k); });
        var r = vm.mainList.currentRow;
        if (r && r.MAC_MODEM) macOwnerCheck(vm, String(r.MAC_MODEM).replace(/[\s:\-*]/g, ''));
        else showChk('MAC_MODEM', '', '');
      }, 250);
    });
    vm.$watch('mainList.currentRow.MAC_MODEM', function (nv) {
      if (!nv || String(nv).replace(/[\s:\-*]/g, '').length < 11) setTimeout(function () { if (__featOn()) showChk('MAC_MODEM', '', ''); }, 120);
    });
  }

  // [v86] Keyboard covers the bottom fields (비고): the helper app draws edge-to-edge and does not
  //   shrink the page for the keyboard, so the last fields cannot scroll above it. On focus, pad the
  //   field's scroll container and bring the field to the middle; remove the padding on blur.
  try {
    if (!window.__kbLiftHooked) {
      window.__kbLiftHooked = true;
      var __padded = null, __padOrig = '';
      var scrollParent = function (el) {
        for (var n = el.parentElement; n && n !== document.body; n = n.parentElement) {
          var oy = getComputedStyle(n).overflowY;
          if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
        }
        return document.scrollingElement || document.body;
      };
      var unpad = function () {
        if (__padded) { __padded.style.paddingBottom = __padOrig; __padded = null; }
      };
      document.addEventListener('focusin', function (e) {
        try {
          var t = e.target;
          if (!t || !/^(INPUT|TEXTAREA)$/.test(t.tagName) || t.readOnly) return;
          if (/^(checkbox|radio|button|submit|file|hidden)$/i.test(t.type || '')) return;
          if (!__featOn()) return;
          var sp = scrollParent(t);
          if (__padded !== sp) { unpad(); __padded = sp; __padOrig = sp.style.paddingBottom; }
          sp.style.paddingBottom = '60vh';
          setTimeout(function () { try { t.scrollIntoView({ block: 'center' }); } catch (x) {} }, 350);
        } catch (x) {}
      }, true);
      document.addEventListener('focusout', function () {
        setTimeout(function () {
          var a = document.activeElement;
          if (!a || !/^(INPUT|TEXTAREA)$/.test(a.tagName)) unpad();
        }, 250);
      }, true);
    }
  } catch (e) {}
  // ===== [v98] 사진 크게 보기 BEGIN (전 작업자 · 헬퍼만) =====
  //   awms 는 사진 칸(3~6)을 누르면 새 창으로 큰 사진을 연다. 헬퍼 WebView 는 새 창을 막아 아무 일도 안 일어난다.
  //   → 새 창 대신 같은 화면 위에 사진을 띄운다. 저장 흐름·사진 칸 값은 건드리지 않는다(읽기만).
  //   가로채는 길 2개: window.open(사진 주소) · <a target=_blank href=사진 주소> 클릭. 그 밖의 사진 클릭은 그대로 둔다
  //   (사진 칸 누르기 = 다시 올리기일 수 있어서). 사진 주소 = singleFile.innorix?atchFileId= 또는 blob: 이미지.
  //   진단: 'photo-view'(띄움) · 'photo-probe'(사진 img 를 눌렀는데 새 창 시도가 없었음 — 다른 길로 여는지 확인용).
  // [v98-photo-begin]
  var PHOTO_SLOTS = [['ATCH_FILE_ID_3', '1 작업전'], ['ATCH_FILE_ID_4', '2 모뎀맥'], ['ATCH_FILE_ID_5', '3 계기'], ['ATCH_FILE_ID_6', '4 집합']];
  function photoIsUrl(u) {
    u = String(u || '');
    return /singleFile\.innorix\?[^#]*atchFileId=/i.test(u) || /^blob:/i.test(u) || /\.(jpe?g|png)(\?|$)/i.test(u);
  }
  function photoFid(u) { var m = /atchFileId=([^&#]+)/i.exec(String(u || '')); return m ? decodeURIComponent(m[1]) : ''; }
  function photoUrl(fid) { return '/singleFile.innorix?atchFileId=' + encodeURIComponent(fid); }
  // 지금 행의 사진 칸 목록(이전·다음). 연 사진이 그 안에 없으면 그 한 장만.
  function photoList(url, row) {
    var fid = photoFid(url), list = [];
    if (row) PHOTO_SLOTS.forEach(function (s) { if (row[s[0]]) list.push({ url: photoUrl(row[s[0]]), fid: String(row[s[0]]), name: s[1] }); });
    var at = -1;
    for (var i = 0; i < list.length; i++) if (fid && list[i].fid === fid) at = i;
    if (at < 0) return { list: [{ url: url, fid: fid, name: '' }], at: 0 };
    return { list: list, at: at };
  }
  // [v98-photo-end]
  // 닫으면 원래 상태 그대로: 화면 스크롤·열린 창·입력값·포커스·body 스타일·history 를 건드리지 않는다(덮개만 붙였다 뗌).
  //   ★history 는 쓰지 않는다: pushState/back 은 awms 쪽 popstate 리스너에도 그대로 전달된다(먼저 붙은 리스너는 못 막음, 실측).
  //   ★안드로이드 뒤로가기 키는 inject 가 못 잡는다 — 헬퍼 APK(Capacitor 7, App 플러그인 없음)는 뒤로가기를 WebView 에 안 넘기고
  //     앱을 내린다. APK 가 OnBackPressedCallback 에서 window.__photoBack() 을 부르면(참이면 소비) 덮개만 닫힌다 — 다음 APK 때.
  function photoClose() {
    var el = document.getElementById('__photo_view');
    if (el) { el.parentNode.removeChild(el); return true; }
    return false;
  }
  window.__photoClose = photoClose;
  window.__photoBack = function () { return photoClose(); };
  function photoOverlay(url, row) {
    try {
      var old = document.getElementById('__photo_view'); if (old) old.parentNode.removeChild(old);   // 겹쳐 쌓지 않음
      var P = photoList(url, row), at = P.at;
      var ov = document.createElement('div');
      ov.id = '__photo_view';
      ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#000;display:flex;flex-direction:column;touch-action:none;font-family:-apple-system,sans-serif;';
      ov.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:calc(env(safe-area-inset-top,0px) + 8px) 10px 8px;color:#fff">' +
        '<div id="__pv_name" style="flex:1;font-size:15px;font-weight:700"></div>' +
        '<button id="__pv_close" style="height:38px;border:0;border-radius:9px;background:#fff;color:#101828;padding:0 16px;font-size:15px;font-weight:800">닫기</button></div>' +
        '<div id="__pv_box" style="flex:1;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center">' +
        '<img id="__pv_img" style="max-width:100%;max-height:100%;transform-origin:center center;user-select:none;-webkit-user-drag:none">' +
        '<div id="__pv_msg" style="position:absolute;color:#98a2b3;font-size:14px"></div></div>' +
        '<div id="__pv_nav" style="display:flex;gap:8px;padding:8px 10px calc(env(safe-area-inset-bottom,0px) + 10px)">' +
        '<button id="__pv_prev" style="flex:1;height:44px;border:1px solid #475467;border-radius:10px;background:#101828;color:#fff;font-size:15px">이전</button>' +
        '<button id="__pv_next" style="flex:1;height:44px;border:1px solid #475467;border-radius:10px;background:#101828;color:#fff;font-size:15px">다음</button></div>';
      ov.addEventListener('mousedown', function (e) { e.preventDefault(); });   // 덮개 버튼이 포커스를 가져가지 않게(닫은 뒤 포커스·키보드 그대로)
      document.body.appendChild(ov);
      var img = ov.querySelector('#__pv_img'), msg = ov.querySelector('#__pv_msg');
      var sc = 1, tx = 0, ty = 0;
      var apply = function () { img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + sc + ')'; };
      var show = function (i) {
        at = (i + P.list.length) % P.list.length;
        var it = P.list[at];
        sc = 1; tx = 0; ty = 0; apply();
        msg.textContent = '불러오는 중';
        img.style.visibility = 'hidden';
        img.onload = function () { msg.textContent = ''; img.style.visibility = 'visible'; };
        img.onerror = function () { msg.textContent = '사진 없음'; };
        img.src = it.url;
        ov.querySelector('#__pv_name').textContent = (it.name || '사진') + (P.list.length > 1 ? '  ' + (at + 1) + '/' + P.list.length : '');
      };
      var nav = ov.querySelector('#__pv_nav');
      if (P.list.length < 2) nav.style.display = 'none';
      ov.querySelector('#__pv_prev').onclick = function () { show(at - 1); };
      ov.querySelector('#__pv_next').onclick = function () { show(at + 1); };
      ov.querySelector('#__pv_close').onclick = function () { photoClose(); };
      ov.querySelector('#__pv_box').addEventListener('click', function (e) { if (e.target === e.currentTarget) photoClose(); });   // 사진 바깥 검은 곳
      // 두 손가락 = 확대·축소, 한 손가락 = 확대 상태에서 이동 / 원래 크기에서 옆으로 밀기 = 이전·다음, 두 번 톡 = 2배·원래
      var t0 = null, d0 = 0, s0 = 1, p0 = null, lastTap = 0;
      var box = ov.querySelector('#__pv_box');
      var dist = function (a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); };
      box.addEventListener('touchstart', function (e) {
        if (e.touches.length === 2) { d0 = dist(e.touches[0], e.touches[1]); s0 = sc; p0 = null; }
        else if (e.touches.length === 1) {
          p0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: tx, ty: ty };
          var now = Date.now();
          if (now - lastTap < 300) { sc = sc > 1 ? 1 : 2; tx = ty = 0; apply(); p0 = null; }
          lastTap = now;
        }
        t0 = Date.now();
      }, { passive: true });
      box.addEventListener('touchmove', function (e) {
        if (e.touches.length === 2 && d0) { sc = Math.max(1, Math.min(6, s0 * dist(e.touches[0], e.touches[1]) / d0)); if (sc === 1) { tx = ty = 0; } apply(); }
        else if (e.touches.length === 1 && p0 && sc > 1) { tx = p0.tx + e.touches[0].clientX - p0.x; ty = p0.ty + e.touches[0].clientY - p0.y; apply(); }
      }, { passive: true });
      box.addEventListener('touchend', function (e) {
        if (p0 && sc === 1 && e.changedTouches.length && P.list.length > 1) {
          var dx = e.changedTouches[0].clientX - p0.x;
          if (Math.abs(dx) > 60 && Date.now() - t0 < 600) show(at + (dx < 0 ? 1 : -1));
        }
        if (e.touches.length < 2) d0 = 0;
      }, { passive: true });
      show(at);
      rec({ stage: 'photo-view', fid: P.list[at].fid, n: P.list.length });
    } catch (e) { rec({ stage: 'photo-view-err', msg: String(e) }); }
  }
  window.__photoOverlay = photoOverlay;
  function photoRow() {
    try { var vm = getAwmsVM(); return vm && vm.mainList && vm.mainList.currentRow; } catch (e) { return null; }
  }
  try {
    if (window.__awmsHelper && !window.__photoViewHooked) {
      window.__photoViewHooked = true;
      var __lastOpenTry = 0;
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('__photo_view')) photoClose(); }, true);
      var _open = window.open;
      window.open = function (u) {
        try {
          if (__featOn() && photoIsUrl(u)) {
            __lastOpenTry = Date.now();
            photoOverlay(String(u), photoRow());
            return { closed: false, close: function () {}, focus: function () {}, blur: function () {},
                     document: { write: function () {}, close: function () {} }, location: {} };
          }
        } catch (e) {}
        return _open.apply(window, arguments);
      };
      document.addEventListener('click', function (e) {
        try {
          if (!__featOn()) return;
          var a = e.target && e.target.closest && e.target.closest('a[href]');
          if (a && photoIsUrl(a.getAttribute('href')) && (a.target === '_blank' || a.hasAttribute('download'))) {
            e.preventDefault(); e.stopPropagation();
            __lastOpenTry = Date.now();
            photoOverlay(a.href, photoRow());
            return;
          }
          // 진단만: 사진 img 를 눌렀는데 600ms 안에 새 창 시도가 없으면 기록(다른 길로 여는지 알아내기)
          var im = e.target && e.target.tagName === 'IMG' ? e.target : null;
          if (im && photoIsUrl(im.currentSrc || im.src)) {
            var t = Date.now();
            setTimeout(function () {
              if (__lastOpenTry < t) {
                var p = im.parentElement;
                rec({ stage: 'photo-probe', id: im.id || '', cls: String(im.className || ''), alt: im.alt || '',
                      p: p ? (p.tagName + '#' + (p.id || '') + '.' + String(p.className || '')) : '', src: String(im.src).slice(0, 80) });
              }
            }, 600);
          }
        } catch (x) {}
      }, true);
    }
  } catch (e) {}
  // ===== [v98] 사진 크게 보기 END =====

  // ===== [v97] 자재관리 BEGIN (테스터 전용 · awms 는 읽기만) =====
  //   영준님 2026-11-14: "일단 불러오고. 그것을 일단 다 AE타입이라 생각해. 등록된 모뎀이 아닌것은
  //   자재추가할수있게해서 따로장부를 기록. 타입별 개수도 나오게."
  //   awms 호출 = mobMtl6000 selectList(출고 20·인계 40) · mobMtl4000 selectBarcdQr · mobCst1000 getMainList. 전부 GET.
  //   내 모뎀 규칙 = scripts/my_stock.py 장부 방식(main 의 ledger 갈래)과 같다:
  //     출고 행 중 인계자 = 본인(장애 교체로 잡힌 1개 출고) 뺌 · 출고는 6/22 일괄 재출고 이후만 · 인계는 날짜 무관
  //     · 자재소유 N 은 내 것 아님 · 교체(M1020)로 떼어 낸 옛 모뎀(EXT_FCTY_ID)이 내 출고로 잡힌 것 뺌
  //     · 시공 목록(getMainList MAC_MODEM)에 있으면 '사용'.
  //   따로장부 = awms 자재가 모르는 실물 — Firebase helperStock/<USER_ID>/offbook/<MAC>. awms 와 겹치지 않는다.
  var STOCK_FB = 'https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app/helperStock/';
  var STOCK_SINCE = '20260622';
  var STOCK_ROWS = [
    ['LTE 모뎀(AE타입)', 'LTE AE'], ['LTE 모뎀(E타입)', 'LTE E'], ['LTE 모뎀(G타입)', 'LTE G'],
    ['LTE 모뎀(AMIGO)', 'LTE 아미고'], ['PLC모뎀(AE타입)', 'PLC AE'], ['PLC모뎀(E 타입)', 'PLC E'],
    ['IotPLC모뎀(AE타입)', 'IoT PLC AE'], ['IotPLC모뎀(E 타입)', 'IoT PLC E'], ['IotPLC모뎀(AMIGO)', 'IoT PLC 아미고']];

  // [v97-kind-begin] scripts/my_stock.py kind() 와 같은 규칙. E 는 추정하지 않는다(실물 확인 화면 없음 = 전부 AE).
  //   고치면 scripts/test_helper_stock.py 가 my_stock.kind() 와 대조한다.
  var STOCK_AMIGO = ['012497', '012498', '012536', '012642'];
  var STOCK_GTYPE = ['012540', '012545', '012556'];
  function stockKind(mac) {
    var m = String(mac || '').toUpperCase();
    if (m.indexOf('012') === 0) {
      if (STOCK_AMIGO.indexOf(m.slice(0, 6)) >= 0) return 'LTE 모뎀(AMIGO)';
      if (STOCK_GTYPE.indexOf(m.slice(0, 6)) >= 0) return 'LTE 모뎀(G타입)';
      return 'LTE 모뎀(AE타입)';
    }
    if (m.indexOf('AC5E8C') === 0) return m.slice(6, 8) === 'B0' ? 'IotPLC모뎀(AMIGO)' : 'IotPLC모뎀(AE타입)';
    if (m.indexOf('8472070') === 0) return ['E3', 'E4', 'D9'].indexOf(m.slice(7, 9)) >= 0 ? 'PLC모뎀(AE타입)' : 'IotPLC모뎀(AE타입)';
    if (m.indexOf('847207E') === 0) return 'IotPLC모뎀(AE타입)';
    if (/^(E0AEED|847207B|847207C|847207D)/.test(m)) return 'PLC모뎀(AE타입)';
    if (/^(44B433|0014B0)/.test(m)) return 'HPGP모뎀(AE타입)';
    return '미분류 ' + m.slice(0, 7);
  }
  // [v97-kind-end]

  function stockNorm(mac) { return String(mac || '').replace(/[\s:\-*]/g, '').toUpperCase(); }
  function stockYmd(d) {   // KST YYYYMMDD
    var k = new Date((d ? d.getTime() : Date.now()) + 9 * 3600 * 1000);
    return k.toISOString().slice(0, 10).replace(/-/g, '');
  }

  // [v97-build-begin] 순수 계산 — 응답 배열만 받는다(시험에서 녹화 응답으로 돌린다).
  //   r20 / r20N = 출고 탭 전체 / 자재소유 N · r40 / r40N = 인계 탭 · main = getMainList 행 · off = 따로장부 {MAC: {...}}
  function stockBuild(me, r20, r20N, r40, r40N, main, off, today) {
    var N20 = {}, N40 = {}, i, x, k;
    for (i = 0; i < (r20N || []).length; i++) N20[stockNorm(r20N[i].FCTY_ID)] = 1;
    for (i = 0; i < (r40N || []).length; i++) N40[stockNorm(r40N[i].FCTY_ID)] = 1;
    var used = {}, ext = {}, todayMeters = {}, todayUsed = {};
    for (i = 0; i < (main || []).length; i++) {
      x = main[i] || {};
      k = stockNorm(x.MAC_MODEM);
      if (k && k !== '-') used[k] = 1;
      var e = stockNorm(x.EXT_FCTY_ID);
      if (x.WORK_DIV === 'M1020' && e && e !== '-') ext[e] = 1;
      // 오늘 사용 = 새 모뎀을 쓴 마스터(신설·교체), 계기당 한 번(맥 정정 재전송은 옛 행이 남는다)
      var wd = String(x.WORK_DATE || '').replace(/\D/g, '').slice(0, 8);
      if (wd === today && String(x.MODEM_DIV) === '10' && (x.WORK_DIV === 'M1010' || x.WORK_DIV === 'M1020')
          && k && !todayMeters[x.INSTR_NUM]) {
        todayMeters[x.INSTR_NUM] = 1;
        var tk = stockKind(k);
        todayUsed[tk] = (todayUsed[tk] || 0) + 1;
      }
    }
    var ledger = {}, rows = {}, drop = { self: 0, before: 0, notOwned: 0, ext: 0 };
    var take = function (arr, src, N) {
      for (var j = 0; j < (arr || []).length; j++) {
        var y = arr[j] || {}, m = stockNorm(y.FCTY_ID);
        if (!m) continue;
        ledger[m] = 1;
        if (src === '20' && String(y.HNDOVR_USER_ID || '') === me) { drop.self++; continue; }
        var row = { mac: m, kind: stockKind(m), ymd: String(y.WRHSG_SHP_YMD || ''), sts: String(y.MTRL_STS_CD || ''),
                    src: src, owned: !N[m], from: String(y.HNDOVR_USER_NM || '') };
        if (src === '40') in40[m] = 1;
        if (rows[m] && rows[m].owned) continue;              // 출고·인계 양쪽이면 소유 행을 남긴다(백엔드와 같다)
        rows[m] = row;
      }
    };
    var in40 = {};
    take(r20, '20', N20);
    take(r40, '40', N40);
    var list = [];
    for (k in rows) {
      var r = rows[k];
      if (!r.owned) { drop.notOwned++; continue; }
      if (!in40[k] && r.ymd && r.ymd < STOCK_SINCE) { drop.before++; continue; }   // 인계받은 맥은 날짜 무관
      r.used = !!used[k];
      if (!r.used && ext[k]) { drop.ext++; continue; }
      list.push(r);
    }
    var offList = [];
    for (k in (off || {})) {
      var o = off[k] || {}, m2 = stockNorm(k);
      offList.push({ mac: m2, kind: stockKind(m2), addedAt: o.addedAt || 0, note: o.note || '',
                     inAwms: !!ledger[m2], used: !!used[m2] });
    }
    var counts = {};
    var bump = function (kd, f) { counts[kd] = counts[kd] || { awms: 0, off: 0 }; counts[kd][f]++; };
    for (i = 0; i < list.length; i++) if (!list[i].used) bump(list[i].kind, 'awms');
    for (i = 0; i < offList.length; i++) if (!offList[i].inAwms && !offList[i].used) bump(offList[i].kind, 'off');
    return { list: list, off: offList, counts: counts, todayUsed: todayUsed, drop: drop, ledger: ledger, own: rows };   // [v102] own = 출고·인계 맥 전부(소유 여부) — 작업 검사가 씀
  }
  // [v97-build-end]

  function stockMe() {
    try {
      var vm = getAwmsVM();
      var s = vm && (vm.session || (vm.$root && vm.$root.session));
      if (s && s.USER_ID) return String(s.USER_ID);
      var all = document.querySelectorAll('body *');
      for (var i = 0; i < all.length && i < 3000; i++) {
        var v = all[i].__vue__;
        var r = v && v.$root;
        if (r && r.session && r.session.USER_ID) return String(r.session.USER_ID);
      }
    } catch (e) {}
    return '';
  }
  function stockTester() { var me = stockMe(); return !!me; }   // v100: 전 작업자 공개
  window.__stockTester = stockTester;

  function stockGet(url, app) {
    return fetch(url, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' },
                        referrer: 'https://awms.kdn.com/html/main/index.html?app=' + app + '&menu=' + app + (app === 'MOBMTL' ? '6000' : '1000') })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        if ((r.headers.get('content-type') || '').indexOf('json') < 0) throw new Error('awms 세션 만료');
        return r.json();
      });
  }
  function stockMtl(radio, yn) {
    return stockGet('/ami/mob/mtl/mobMtl6000/selectList?radioVal=' + radio + '&vFclClCode=&vMtlCode=&vShpPurpCtt=&sortCd=1&searchVal=&myMtrlYn=' + yn, 'MOBMTL')
      .then(function (j) { return Array.isArray(j) ? j : []; });
  }
  // 시공 목록은 달마다 끊어 받는다 — 긴 구간·큰 pRowCount 는 HTTP 500(my_stock replaced_ext 실측)
  function stockMain(since, today) {
    var spans = [], y = +since.slice(0, 4), m = +since.slice(4, 6);
    while (true) {
      var a = '' + y + ('0' + m).slice(-2) + '01';
      if (a > today) break;
      var ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
      var b = stockYmd(new Date(Date.UTC(ny, nm - 1, 1) - 9 * 3600 * 1000 - 1000));
      spans.push([a < since ? since : a, b > today ? today : b]);
      y = ny; m = nm;
    }
    return Promise.all(spans.map(function (sp) {
      return stockGet('/ami/mob/cst/mobCst1000/getMainList?FLAG=M10&DEPT1=3970&DEPT2=&searchKeyword=&sortKey=0&workStep=25,28,29' +
                      '&pPageNo=1&pRowCount=5000&strDate=' + sp[0] + '&endDate=' + sp[1], 'MOBCST')
        .then(function (d) { return Array.isArray(d) ? d : ((d && (d.rows || d.list)) || []); });
    })).then(function (parts) { return [].concat.apply([], parts); });
  }
  function stockFb(me, mac, method, body) {
    var u = STOCK_FB + encodeURIComponent(me) + '/offbook' + (mac ? '/' + encodeURIComponent(mac) : '') + '.json';
    var o = { method: method || 'GET' };
    if (body) { o.body = JSON.stringify(body); o.headers = { 'Content-Type': 'application/json' }; }
    return fetch(u, o).then(function (r) { if (!r.ok) throw new Error('Firebase HTTP ' + r.status); return r.json(); });
  }

  function stockEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function stockFmtYmd(y) { y = String(y || ''); return y.length === 8 ? y.slice(4, 6) + '/' + y.slice(6) : (y || '-'); }

  var __stock = { data: null, tab: 'hold', me: '' };
  function stockRender() {
    var ov = document.getElementById('__helper_stock');
    if (!ov) return;
    var body = ov.querySelector('#__stock_body');
    var d = __stock.data;
    if (!d) { body.innerHTML = '<div style="padding:30px;text-align:center;color:#667085">조회 중…</div>'; return; }
    if (d.err) { body.innerHTML = '<div style="padding:24px;color:#d92d20;font-weight:700">조회 실패</div>'; return; }
    var b = d.build, c = b.counts, t = b.todayUsed, h = '';
    var td = 'padding:7px 5px;border-bottom:1px solid #eaecf0;text-align:right;white-space:nowrap;';   // [v97] 머리글·행 이름 한 줄(360px 폭 확인)
    h += '<table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff">' +
      '<tr style="background:#f2f4f7;color:#475467"><th style="' + td + 'text-align:left">자재</th><th style="' + td + '">awms</th>' +
      '<th style="' + td + '">별도</th><th style="' + td + '">총계</th><th style="' + td + '">금일</th></tr>';
    var keys = STOCK_ROWS.slice(), tot = { a: 0, o: 0, t: 0 };
    var extra = Object.keys(c).concat(Object.keys(t)).filter(function (k, i, s) {
      return s.indexOf(k) === i && !STOCK_ROWS.some(function (r) { return r[0] === k; });
    });
    extra.forEach(function (k) { keys.push([k, k.replace('모뎀', ' ')]); });
    keys.forEach(function (r) {
      var v = c[r[0]] || { awms: 0, off: 0 }, n = t[r[0]] || 0;
      tot.a += v.awms; tot.o += v.off; tot.t += n;
      var dim = (v.awms + v.off + n) ? '' : 'color:#98a2b3;';
      h += '<tr style="' + dim + '"><td style="' + td + 'text-align:left">' + stockEsc(r[1]) + '</td><td style="' + td + '">' + v.awms +
        '</td><td style="' + td + '">' + v.off + '</td><td style="' + td + 'font-weight:700">' + (v.awms + v.off) + '</td><td style="' + td + '">' + n + '</td></tr>';
    });
    h += '<tr style="font-weight:800"><td style="' + td + 'text-align:left">총계</td><td style="' + td + '">' + tot.a + '</td><td style="' + td + '">' + tot.o +
      '</td><td style="' + td + '">' + (tot.a + tot.o) + '</td><td style="' + td + '">' + tot.t + '</td></tr></table>';
    h += '<div style="font-size:12px;color:#667085;margin:6px 2px 12px">awms 등록 재고 · 별도 관리 재고 · 금일 사용 · 실재고와 차이 가능</div>';
    var dr = b.drop;
    h += '<div style="font-size:11px;color:#98a2b3;margin:-6px 2px 12px">제외: 본인 인계 ' + dr.self + ' · 6/22 이전 ' + dr.before +
      ' · 소유 해제 ' + dr.notOwned + ' · 교체 철거 ' + dr.ext + '</div>';
    var tabs = [['hold', '재고'], ['used', '사용 완료'], ['off', '별도 관리 자재']];
    h += '<div style="display:flex;gap:6px;margin-bottom:8px">';
    tabs.forEach(function (tb) {
      var on = __stock.tab === tb[0];
      h += '<button data-tab="' + tb[0] + '" style="flex:1;height:36px;border-radius:9px;font-size:14px;font-weight:700;border:1px solid ' +
        (on ? '#175cd3;background:#175cd3;color:#fff' : '#d0d5dd;background:#fff;color:#344054') + '">' + tb[1] + '</button>';
    });
    h += '</div>';
    var rowsH = '', cell = 'padding:6px 4px;border-bottom:1px solid #f2f4f7;';
    if (__stock.tab === 'off') {
      b.off.sort(function (x, y) { return (y.addedAt || 0) - (x.addedAt || 0); });
      b.off.forEach(function (o) {
        var st = o.inAwms ? '<span style="color:#b54708;font-weight:700">awms 등록됨</span>' : (o.used ? '사용 완료' : '재고');
        rowsH += '<tr><td style="' + cell + 'font-family:monospace">' + stockEsc(o.mac) + '</td><td style="' + cell + '">' + stockEsc(o.kind) +
          '</td><td style="' + cell + '">' + (o.addedAt ? stockFmtYmd(stockYmd(new Date(o.addedAt))) : '-') + '</td><td style="' + cell + '">' + st +
          (o.note ? '<div style="font-size:11px;color:#667085">' + stockEsc(o.note) + '</div>' : '') +
          '</td><td style="' + cell + '"><button data-del="' + stockEsc(o.mac) + '" style="border:1px solid #d0d5dd;background:#fff;border-radius:7px;padding:4px 7px;font-size:12px;white-space:nowrap">등록 해제</button></td></tr>';
      });
      if (!b.off.length) rowsH = '<tr><td style="padding:16px;color:#98a2b3">없음</td></tr>';
    } else {
      var want = __stock.tab === 'used';
      var arr = b.list.filter(function (r) { return r.used === want; });
      arr.sort(function (x, y) { return x.kind < y.kind ? -1 : x.kind > y.kind ? 1 : (y.ymd > x.ymd ? 1 : y.ymd < x.ymd ? -1 : 0); });
      arr.slice(0, 600).forEach(function (r) {
        rowsH += '<tr><td style="' + cell + 'font-family:monospace">' + stockEsc(r.mac) + '</td><td style="' + cell + '">' + stockEsc(r.kind) +
          '</td><td style="' + cell + '">' + stockFmtYmd(r.ymd) + (r.src === '40' ? ' 인계' : '') + '</td><td style="' + cell + '">' + (r.used ? '사용 완료' : '재고') + '</td></tr>';
      });
      if (arr.length > 600) rowsH += '<tr><td style="padding:10px;color:#98a2b3">외 ' + (arr.length - 600) + '건</td></tr>';
      if (!arr.length) rowsH = '<tr><td style="padding:16px;color:#98a2b3">없음</td></tr>';
    }
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff">' + rowsH + '</table>';
    body.innerHTML = h;
    Array.prototype.forEach.call(body.querySelectorAll('button[data-tab]'), function (bt) {
      bt.onclick = function () { __stock.tab = bt.getAttribute('data-tab'); stockRender(); };
    });
    Array.prototype.forEach.call(body.querySelectorAll('button[data-del]'), function (bt) {
      bt.onclick = function () {
        var m = bt.getAttribute('data-del');
        if (!confirm('등록 해제 ' + m)) return;
        stockFb(__stock.me, m, 'DELETE').then(function () { rec({ stage: 'stock-off-del', mac: m }); stockLoad(); })
          .catch(function (e) { rec({ stage: 'stock-del-fail', mac: m, msg: String(e && e.message || e) }); alert('등록 해제 실패'); });
      };
    });
  }

  function stockLoad() {
    var me = __stock.me, today = stockYmd();
    __stock.data = null; stockRender();
    var p = [stockMtl('20', ''), stockMtl('20', 'N'), stockMtl('40', ''), stockMtl('40', 'N')];
    Promise.all(p).then(function (m) {
      var since = STOCK_SINCE;
      m[2].forEach(function (x) { var y = String(x.WRHSG_SHP_YMD || ''); if (/^\d{8}$/.test(y) && y < since) since = y; });
      return Promise.all([stockMain(since, today), stockFb(me).catch(function () { return {}; })]).then(function (r) {
        var b = stockBuild(me, m[0], m[1], m[2], m[3], r[0], r[1] || {}, today);
        __stock.data = { build: b, at: Date.now() };
        rec({ stage: 'stock-load', hold: b.list.filter(function (x) { return !x.used; }).length, off: b.off.length });
        stockRender();
      });
    }).catch(function (e) { __stock.data = { err: e.message || String(e) }; rec({ stage: 'stock-load-fail', msg: __stock.data.err }); stockRender(); });
  }

  // 자재 추가 — 스캔(또는 손입력)마다 대기 목록에 쌓고, [저장] 한 번에 모아 쓴다(영준님 2026-11-15).
  //   들어올 때 바로 검사: 형식 · 종류 · 내 출고/인계 장부 · awms 자재(selectBarcdQr == []) · 따로장부 · 대기 목록 중복.
  //   거절된 줄은 이유와 함께 남고 저장되지 않는다. [저장] 전에는 아무것도 쓰지 않는다.
  // [v97-check-begin] 화면·통신 없이 판정만(시험에서 node 로 돌린다). '' = 통과
  function stockCheckLocal(mac, build, pending) {
    if (!mac) return 'MAC 미입력';
    var fe = macFormatError(mac, true);
    if (fe) return 'MAC 형식 오류';
    if (stockKind(mac).indexOf('미분류') === 0) return '종류 미상';
    if (!build) return '목록 조회 전';
    if (build.ledger[mac]) return 'awms 등록 자재';
    for (var i = 0; i < build.off.length; i++) if (build.off[i].mac === mac) return '이미 등록';
    for (var j = 0; j < (pending || []).length; j++) if (pending[j].mac === mac) return '중복 스캔';
    return '';
  }
  // [v97-check-end]

  __stock.pending = [];   // [{mac, kind, st: 'wait'|'ok'|'bad', why}]
  function stockPendRender() {
    var box = document.getElementById('__stock_pend');
    if (!box) return;
    var P = __stock.pending, nOk = 0, h = '';
    P.forEach(function (p, i) {
      if (p.st === 'ok') nOk++;
      var col = p.st === 'ok' ? '#067647' : p.st === 'bad' ? '#d92d20' : '#667085';
      var txt = p.st === 'ok' ? '등록 가능' : p.st === 'bad' ? p.why : 'awms 조회 중…';
      h += '<div style="display:flex;align-items:center;gap:8px;padding:7px 4px;border-bottom:1px solid #f2f4f7' + (p.st === 'bad' ? ';background:#fef3f2' : '') + '">' +
        '<div style="flex:1;min-width:0"><div style="font-family:monospace;font-size:15px;font-weight:700' + (p.st === 'bad' ? ';text-decoration:line-through;color:#98a2b3' : '') + '">' + stockEsc(p.mac) + '</div>' +
        '<div style="font-size:12px;color:' + col + '">' + stockEsc(p.kind ? p.kind + ' · ' : '') + stockEsc(txt) + '</div></div>' +
        '<button data-rm="' + i + '" style="width:34px;height:34px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;font-size:16px;color:#667085">×</button></div>';
    });
    box.innerHTML = h || '<div style="padding:10px 4px;font-size:13px;color:#98a2b3">스캔 1회 = 1건</div>';
    Array.prototype.forEach.call(box.querySelectorAll('button[data-rm]'), function (bt) {
      bt.onclick = function () { __stock.pending.splice(+bt.getAttribute('data-rm'), 1); stockPendRender(); };
    });
    var sv = document.getElementById('__stock_save');
    if (sv) {
      var waiting = P.some(function (p) { return p.st === 'wait'; });
      sv.textContent = waiting ? '조회 중…' : '등록 (' + nOk + '건)';
      sv.disabled = !nOk || waiting;
      sv.style.opacity = sv.disabled ? '0.45' : '1';
    }
  }
  function stockPendAdd(raw) {
    var mac = stockNorm(raw);
    var b = __stock.data && __stock.data.build;
    var why = stockCheckLocal(mac, b, __stock.pending);
    var p = { mac: mac || String(raw || ''), kind: mac ? stockKind(mac) : '', st: why ? 'bad' : 'wait', why: why };
    if (p.kind.indexOf('미분류') === 0) p.kind = '';
    __stock.pending.unshift(p);
    stockPendRender();
    if (why) { rec({ stage: 'stock-pend-bad', mac: mac, why: why }); return; }
    stockGet('/ami/mob/mtl/mobMtl4000/selectBarcdQr?vFclCl=M&vUnitCode=10&vBarcdQr=' + encodeURIComponent(mac), 'MOBMTL')
      .then(function (j) {
        if (Array.isArray(j) && j.length === 0) { p.st = 'ok'; }
        else { p.st = 'bad'; p.why = 'awms 등록 자재'; }
      })
      .catch(function (e) { p.st = 'bad'; p.why = '조회 실패'; rec({ stage: 'stock-qr-fail', mac: p.mac, msg: String(e && e.message || e) }); })
      .then(function () { stockPendRender(); });
  }
  function stockPendSave() {
    var ok = __stock.pending.filter(function (p) { return p.st === 'ok'; });
    if (!ok.length) return;
    var now = Date.now(), body = {};
    ok.forEach(function (p) { body[p.mac] = { type: p.kind, addedAt: now, note: '', by: __stock.me }; });
    var sv = document.getElementById('__stock_save');
    if (sv) { sv.disabled = true; sv.textContent = '등록 중…'; }
    // 한 번의 PATCH — 부모 노드를 통째로 바꾸지 않는다(폰에서 넣은 다른 맥은 그대로)
    fetch(STOCK_FB + encodeURIComponent(__stock.me) + '/offbook.json',
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error('Firebase HTTP ' + r.status); return r.json(); })
      .then(function () {
        rec({ stage: 'stock-off-save', n: ok.length });
        __stock.pending = [];
        stockPendRender();
        var msg = document.getElementById('__stock_pendmsg');
        if (msg) { msg.textContent = ok.length + '건 등록 완료'; msg.style.color = '#067647'; }
        stockLoad();
      })
      .catch(function (e) {
        var msg = document.getElementById('__stock_pendmsg');
        if (msg) { msg.textContent = '등록 실패'; msg.style.color = '#d92d20'; }
        rec({ stage: 'stock-save-fail', msg: String(e && e.message || e) });
        stockPendRender();
      });
  }
  function stockAddPanelHtml() {
    return '<div id="__stock_addpanel" style="display:none;background:#fff;border:1px solid #d0d5dd;border-radius:12px;padding:10px;margin-bottom:12px">' +
      '<div style="font-size:15px;font-weight:800;margin-bottom:2px">자재 등록 (별도 관리 자재)</div>' +
      '<div style="font-size:12px;color:#667085;margin-bottom:8px">awms 미등록 자재만</div>' +
      '<button id="__stock_scan" style="width:100%;height:52px;border:0;border-radius:10px;background:#344054;color:#fff;font-size:17px;font-weight:800">스캔</button>' +
      '<div style="display:flex;gap:6px;margin-top:8px"><input id="__stock_mac" autocomplete="off" autocapitalize="characters" placeholder="MAC 직접 입력" ' +
      'style="flex:1;min-width:0;height:40px;border:1px solid #d0d5dd;border-radius:9px;padding:0 10px;font-size:15px;font-family:monospace">' +
      '<button id="__stock_put" style="height:40px;border:1px solid #d0d5dd;border-radius:9px;background:#fff;padding:0 14px;font-size:14px;font-weight:700">입력</button></div>' +
      '<div id="__stock_pend" style="margin-top:8px"></div>' +
      '<div id="__stock_pendmsg" style="min-height:18px;margin-top:6px;font-size:13px;font-weight:700"></div>' +
      '<button id="__stock_save" style="width:100%;height:46px;border:0;border-radius:10px;background:#175cd3;color:#fff;font-size:16px;font-weight:800;margin-top:4px">등록 (0건)</button>' +
      '</div>';
  }
  function stockWireAddPanel(ov) {
    var panel = ov.querySelector('#__stock_addpanel'), inp = ov.querySelector('#__stock_mac');
    ov.querySelector('#__stock_addbtn').onclick = function () {
      var open = panel.style.display === 'none';
      panel.style.display = open ? 'block' : 'none';
      if (!open) window.__stockScanCb = null;
      stockPendRender();
    };
    ov.querySelector('#__stock_scan').onclick = function () {
      var msg = ov.querySelector('#__stock_pendmsg');
      msg.textContent = '';
      if (!(window.AndroidScanner && window.AndroidScanner.scan)) { msg.textContent = '스캐너 없음'; msg.style.color = '#b54708'; return; }
      // 모뎀 라벨 QR(자재 ID 줄) / 바코드 — awms 칸에 넣을 때와 같은 변환(convertForField)
      window.__stockScanCb = function (raw) { if (raw) stockPendAdd(convertForField('MAC_MODEM', raw)); };
      window.AndroidScanner.scan();
    };
    var put = function () { if (inp.value.trim()) { stockPendAdd(inp.value); inp.value = ''; } };
    ov.querySelector('#__stock_put').onclick = put;
    inp.onkeydown = function (e) { if (e.key === 'Enter') put(); };
    ov.querySelector('#__stock_save').onclick = stockPendSave;
    stockPendRender();
  }


  // ===== [v102] 작업 검사 BEGIN (테스터 전용 · awms 읽기만 · OCR 없음) =====
  //   영준님 2026-11-16: 자재 현황 화면 안에 [작업 검사] — 그날 내 awms 등록(MOBCST getMainList)을 맥 작업검사
  //   (scripts/cst_daily_check.py)와 같은 규칙으로 판정. 빨강 = 고칠 것(할 일 한 줄) / 노랑 = 볼 것 / 초록 = 메모·숫자.
  //   ★규칙 원본은 cst-input/backend/cst_rules.py(맥 → 통신방식·계기유형·분기)와 cst_daily_check.py app_check.
  //     여기 규칙을 고치면 저쪽도 — scripts/test_helper_workcheck.py 가 둘을 대조한다(함수 단위 + 하루치 대조).
  //   맥 검사와 다른 점: 사진 판독(OCR) 없음 · 지도 완료(workStatus) 안 봄 — 대신 같은 주소 리스트 계기로
  //     '번호 1자리 차이'·'누락 후보'를 노랑으로 낸다. 아미큐 보관함·자재 대조(지난 검사 재고)도 없음.
  //   읽는 것: getMainList(올해, 달마다) · getDetail(그날 슬레이브 + 뒷자리 겹치는 앞선 슬레이브의 분기) ·
  //     자재 현황이 이미 받은 출고/인계·별도 관리 자재 · data/search-index.json(리스트·주소·지사) · 리스트 이름표(__names).
  //   쓰는 것: 없음(Firebase 로그 rec 만).
  // [v102-wc-begin] 순수 판정 — 화면·통신 없음(시험에서 node 로 돌린다)
  var WC_TYPE_MAP = { '17': 'E', '19': 'EA', '25': 'G', '26': 'G', '27': 'G', '45': 'G', '46': 'G', '47': 'G',
                      '52': 'Amigo', '53': 'Amigo', '54': 'Amigo', '55': 'Amigo' };
  var WC_TYPE_TO_INSTM = { E: 'HW4020', EA: 'HW4040', G: 'HW4030', Amigo: 'HW4050' };
  var WC_BUNGI = ['무선', '0.5'];
  var WC_DEPT_NM = { '3600': '마포용산', '3500': '서대문은평', '7793': '서울본부직할', '3100': '광진성동',
                     '3400': '노원도봉', '4080': '강북성북', '3000': '동대문중랑' };
  var WC_LAW = /^[0-9A-Z]{2}[0-9]{9}$/;
  var WC_FOLD = { B: '8', O: '0', S: '5', D: '0', I: '1' };
  function wcFold(s) { return String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/[BOSDI]/g, function (c) { return WC_FOLD[c]; }); }
  function wcOneOff(a, b) {
    if (a.length !== b.length) return false;
    var d = 0;
    for (var i = 0; i < a.length; i++) if (a.charAt(i) !== b.charAt(i)) d++;
    return d === 1;
  }
  // cst_rules.infer_inst_m
  function wcInferM(no) {
    var s = String(no || '');
    while (s.length < 11) s = '0' + s;
    return WC_TYPE_TO_INSTM[WC_TYPE_MAP[s.slice(2, 4)]] || 'HW4010';
  }
  // cst_rules._mac_raw_suffix
  function wcMacSuffix(mac) {
    var raw = String(mac || '').replace(/\D/g, ''), m = String(mac || '').toUpperCase().replace(/[^0-9A-F]/g, '');
    if (/^012\d{8}$/.test(raw)) return 'LTE';
    if (m.indexOf('847207') === 0) {
      var c = m.charAt(6);
      if (c === '0') return ['E3', 'E4', 'D9'].indexOf(m.slice(7, 9)) >= 0 ? '10' : '90';
      if (c === 'E') return '90';
      if (c && 'BCD'.indexOf(c) >= 0) return '10';
    }
    if (m.indexOf('E0AEED') === 0) return '10';
    if (m.indexOf('44B433') === 0 || m.indexOf('0014B0') === 0) return '20';
    if (m.indexOf('AC5E8C') === 0) return '90';
    return '';
  }
  // cst_rules.infer_inst_s
  function wcInferS(instM, mac) {
    if (!instM) return '';
    var s = wcMacSuffix(mac);
    if (!s || s === 'SKIP') return '';
    if (s === 'LTE') return instM + (instM === 'HW4050' ? '92' : '70');
    return instM + s;
  }
  // cst_rules.slave_bungi -> [자동값, 고를 수 있음]
  function wcSlaveBungi(msuf, sm) { var can = msuf === '92' && sm === 'HW4050'; return [can ? '무선' : '0.5', can]; }
  // cst_rules.mac_format_error 와 같은 판정(문구는 v85 macFormatError 명사형). '' = 정상
  function wcMacErr(mac) {
    var s = String(mac || '').replace(/[\s:\-*]/g, '').toUpperCase();
    if (!s) return '비어 있음';
    var e = macFormatError(s, true);
    return e ? e.reason : '';
  }
  function wcUp(s) { return String(s || '').toUpperCase(); }

  // search-index -> 계기별 리스트 행 [{c, a, j}]. 'a'(옛 완료 아카이브)와 이름표 밖 코드(광명·LP무기록)는 빼고
  //   리스트 아카이브(합동 3일 지난 분 등)는 넣는다 — 맥 검사 stats-site-index 와 같은 범위.
  function wcListRows(si, names, want) {
    var rows = si.rows, slots = si.slots, sites = si.sites, out = {}, ok = [], i;
    for (i = 0; i < slots.length; i++) ok.push(slots[i][0] !== 'a' && Object.prototype.hasOwnProperty.call(names, slots[i][0]));
    for (i = 0; i < rows.length; i += 3) {
      if (!ok[rows[i + 2]] || !want[rows[i]]) continue;
      var st = sites[rows[i + 1]];
      (out[rows[i]] = out[rows[i]] || []).push({ c: slots[rows[i + 2]][0], a: st[0], j: si.jisa[st[4]] || '' });
    }
    return out;
  }
  // 주소|리스트 -> 그 리스트 계기 (중복 없이)
  function wcSiteMeters(si, names, keys) {
    var rows = si.rows, slots = si.slots, sites = si.sites, out = {}, seen = {}, ok = [], i;
    for (i = 0; i < slots.length; i++) ok.push(slots[i][0] !== 'a' && Object.prototype.hasOwnProperty.call(names, slots[i][0]));
    for (i = 0; i < rows.length; i += 3) {
      if (!ok[rows[i + 2]] || !rows[i]) continue;
      var k = sites[rows[i + 1]][0] + '|' + slots[rows[i + 2]][0];
      if (!keys[k] || seen[k + '#' + rows[i]]) continue;
      seen[k + '#' + rows[i]] = 1;
      (out[k] = out[k] || []).push(rows[i]);
    }
    return out;
  }
  // 한 모뎀 = 마스터 + 그 마스터에 묶인 행(모든 날짜) + 오늘 행 (cst_daily_check.group_members)
  function wcMembers(master, rs, rows, mac) {
    var out = [], seen = {};
    var put = function (r) { if (!seen[r.INSTR_NUM]) { seen[r.INSTR_NUM] = 1; out.push(r); } };
    if (master) {
      put(master);
      for (var i = 0; i < rows.length; i++) if (wcUp(rows[i].MAC_MODEM) === mac && rows[i].MB_METER_ID === master.INSTR_NUM) put(rows[i]);
    }
    rs.forEach(put);
    return out;
  }
  // 유선(0.5) 쪽인지 — true / false / null(분기 못 읽음) (cst_daily_check.wired)
  //   ★슬레이브는 getDetail 실제 BUNGI 로만 — 규칙상 값으로 추정하지 않는다(아미큐는 아미고 슬레이브도 0.5 로 넣기도 한다).
  //   마스터는 그 계기에 모뎀을 직접 꽂은 것이라 분기가 없다 — 비교에서 뺀다(영준님 2026-11-16).
  function wcWired(r, master, expSuf, det) {
    if (master && r.INSTR_NUM === master.INSTR_NUM) return false;
    var d = det[r.INSTR_NUM];
    if (!d || !Object.prototype.hasOwnProperty.call(d, 'BUNGI')) return null;
    return String(d.BUNGI || '') === '0.5';
  }
  // 뒷자리 2자리 중복 — 같은 모뎀의 분기 0.5(485선) 슬레이브끼리 끝 2자리가 같으면 통신이 안 된다. 오늘 행이 낀 것만 (cst_daily_check.suffix_dups)
  function wcSuffixDups(master, rs, rows, mac, expSuf, det) {
    var today = {}, by = {}, out = [];
    rs.forEach(function (r) { today[r.INSTR_NUM] = 1; });
    wcMembers(master, rs, rows, mac).forEach(function (r) {
      if (wcWired(r, master, expSuf, det) && r.INSTR_NUM.length >= 2) (by[r.INSTR_NUM.slice(-2)] = by[r.INSTR_NUM.slice(-2)] || []).push(r.INSTR_NUM);
    });
    Object.keys(by).sort().forEach(function (s) {
      var ms = by[s].slice().sort();
      if (ms.length > 1 && ms.some(function (m) { return today[m]; })) out.push([s, ms]);
    });
    return out;
  }
  // 분기를 더 받아야 하는 행 = 그날 모뎀의 앞선 슬레이브 중 같은 모뎀 다른 행과 끝 2자리가 겹치는 것 (cst_daily_check.dup_detail_rows)
  function wcDetailWants(day, rows) {
    var macs = {}, by = {}, out = [], i;
    for (i = 0; i < rows.length; i++) if (rows[i].WORK_DATE === day) { macs[wcUp(rows[i].MAC_MODEM)] = 1; if (String(rows[i].MODEM_DIV) !== '10') out.push(rows[i]); }
    for (i = 0; i < rows.length; i++) {
      var m = wcUp(rows[i].MAC_MODEM);
      if (macs[m]) (by[m + '|' + String(rows[i].INSTR_NUM).slice(-2)] = by[m + '|' + String(rows[i].INSTR_NUM).slice(-2)] || []).push(rows[i]);
    }
    Object.keys(by).forEach(function (k) {
      var rs = by[k], u = {};
      rs.forEach(function (r) { u[r.INSTR_NUM] = 1; });
      if (Object.keys(u).length > 1) rs.forEach(function (r) { if (r.WORK_DATE !== day && String(r.MODEM_DIV) !== '10') out.push(r); });
    });
    return out;
  }

  // 할 일(빨강) — 짧은 명사구
  var WC_TODO = {
    '번호 형식': '바른 번호로 새 행 등록', '타입코드': '계기 사진 확인 후 새 행 등록', '중복 등록': '중복 행 정리 (KDN 삭제 요청)',
    '지사 다름': '지사 수정 후 재저장', '남의 자재': '자재 인계 확인', '장부 밖 맥': '모뎀맥 사진 확인',
    '기설 맥 오류': '모뎀맥 사진 확인 후 새 행 등록', '기설 맥 미상': '모뎀맥 사진 확인', '기설 의심': '신설 재등록 여부 확인',
    '등록수 다름': '슬레이브 추가 또는 행 정리', 'DCU 없음': 'DCU ID 입력 후 재저장', '계기유형 오류': '계기유형 수정 후 재저장',
    '통신방식 오류': '통신방식 수정 후 재저장', '아미고 짝': '모뎀·계기 짝 확인', '슬레이브 구분': '작업구분 신설로 재저장',
    '슬레이브 맥 다름': '마스터 맥으로 재저장', '대표계기 다름': '대표계기 확인', '분기 오류': '분기 수정 후 재저장',
    '뒷자리 중복': '통신 불가 — 현장 확인', '번호 1자리 차이': '계기 사진 확인 후 바른 번호로 새 행 등록'
  };
  // inp = {day, rows(올해 getMainList), details{계기: getDetail 행}, own{MAC: {owned}}, off{MAC: 1}, si(search-index), names}
  function wcCheck(inp) {
    var day = inp.day, rows = inp.rows || [], det = inp.details || {}, own = inp.own || {}, off = inp.off || {};
    var items = [], seenItem = {};
    var add = function (lv, sec, kind, o) {
      o = o || {};
      var k = lv + '|' + kind + '|' + (o.meters || []).join(',') + '|' + (o.mac || '');
      if (seenItem[k]) return;
      seenItem[k] = 1;
      o.lv = lv; o.sec = sec; o.kind = kind;
      if (lv === 'red' && WC_TODO[kind]) o.todo = WC_TODO[kind];
      items.push(o);
    };
    var today = rows.filter(function (r) { return r.WORK_DATE === day; });
    var mastersByMac = {}, byMeterMaster = {}, bound = {}, aw = {}, want = {};
    rows.forEach(function (r) {
      aw[r.INSTR_NUM] = 1; want[r.INSTR_NUM] = 1;
      var mac = wcUp(r.MAC_MODEM);
      if (String(r.MODEM_DIV) === '10' && r.MAC_MODEM) {
        (mastersByMac[mac] = mastersByMac[mac] || []).push(r);
        if (!byMeterMaster[r.INSTR_NUM]) byMeterMaster[r.INSTR_NUM] = r;
      }
      var mb = r.MB_METER_ID || (String(r.MODEM_DIV) === '10' ? r.INSTR_NUM : '');
      if (mb) { var bk = mb + '|' + mac; (bound[bk] = bound[bk] || {})[r.INSTR_NUM] = 1; }
    });
    var L = inp.si ? wcListRows(inp.si, inp.names || {}, want) : {};
    var cnt = {};
    today.forEach(function (r) { cnt[r.INSTR_NUM] = (cnt[r.INSTR_NUM] || 0) + 1; });
    var groups = {}, order = [];
    today.slice().sort(function (a, b) { return (a.REG_DATE || 0) - (b.REG_DATE || 0); }).forEach(function (r) {
      var mac = wcUp(r.MAC_MODEM);
      if (!groups[mac]) { groups[mac] = []; order.push(mac); }
      groups[mac].push(r);
    });
    var sum = { meters: today.length, masters: 0, slaves: 0, div: {}, modems: order.length };
    var deferred = [];       // [{mac, outList, keys}] — 같은 주소 리스트 계기를 한 번에 찾는다
    var touched = {};        // 오늘 리스트 계기가 등록된 주소|리스트 -> 1
    order.forEach(function (mac) {
      var rs = groups[mac];
      var ms = rs.filter(function (r) { return String(r.MODEM_DIV) === '10'; });
      var ss = rs.filter(function (r) { return String(r.MODEM_DIV) !== '10'; });
      sum.masters += ms.length; sum.slaves += ss.length;
      var head = ms[0] || rs[0], div = head.WORK_DIV || '';
      if (ms.length) sum.div[div] = (sum.div[div] || 0) + 1;
      if (ms.length && div === 'M1020') { add('grey', 'form', '교체', { mac: mac, meters: [head.INSTR_NUM] }); return; }
      var master = ms.length ? head : null;
      if (!ms.length) {
        var mbid = '';
        for (var i = 0; i < rs.length; i++) if (rs[i].MB_METER_ID) { mbid = rs[i].MB_METER_ID; break; }
        var cand = (mastersByMac[mac] || []).filter(function (m) { return m.WORK_DATE !== day; });
        master = byMeterMaster[mbid] || cand[0] || null;
        if (master) {
          add('green', 'form', '기존 모뎀', { mac: mac, meters: [master.INSTR_NUM], data: master.WORK_DATE });
          if (rs.some(function (r) { return r.INSTR_NUM === master.INSTR_NUM; })) add('green', 'form', '대표계기 슬레이브', { mac: mac, meters: [master.INSTR_NUM] });
        } else add('grey', 'form', '마스터 미확인', { mac: mac, meters: [rs[0].INSTR_NUM] });
      }
      var mdiv = master ? (master.WORK_DIV || '') : div;
      rs.forEach(function (r) {
        var no = r.INSTR_NUM;
        if (!WC_LAW.test(no)) add('red', 'form', '번호 형식', { mac: mac, meters: [no] });
        else if (!WC_TYPE_MAP[no.slice(2, 4)]) add('red', 'form', '타입코드', { mac: mac, meters: [no], data: no.slice(2, 4) });
        if (cnt[no] > 1) add('red', 'form', '중복 등록', { mac: mac, meters: [no], data: cnt[no] + '행' });
      });
      if (ms.length > 1) add('yellow', 'form', '마스터 2개', { mac: mac, meters: ms.map(function (r) { return r.INSTR_NUM; }) });
      if (ms.length) {
        var mine = {};
        ms.forEach(function (r) { mine[r.INSTR_NUM] = 1; });
        var others = {};
        (mastersByMac[mac] || []).forEach(function (m) { if (!mine[m.INSTR_NUM]) others[m.INSTR_NUM] = 1; });
        var ol = Object.keys(others).sort();
        if (ol.length) add('yellow', 'form', '맥 재사용', { mac: mac, meters: ol });
      }
      // 자재
      if (ms.length && div === 'M1010') {
        var sr = own[mac];
        if (!sr && !off[mac]) add('red', 'form', '장부 밖 맥', { mac: mac, meters: [head.INSTR_NUM] });
        else if (sr && !sr.owned) add('red', 'form', '남의 자재', { mac: mac, meters: [head.INSTR_NUM] });
      }
      if (ms.length && div === 'M1030') {
        var err = wcMacErr(mac);
        if (err) add('red', 'form', '기설 맥 오류', { mac: mac, meters: [head.INSTR_NUM], data: err });
        else if (stockKind(mac).indexOf('미분류') === 0) add('red', 'form', '기설 맥 미상', { mac: mac, meters: [head.INSTR_NUM] });
        var sr2 = own[mac];
        var before = (mastersByMac[mac] || []).filter(function (m) { return (m.WORK_DIV === 'M1010' || m.WORK_DIV === 'M1020') && m.INSTR_NUM !== head.INSTR_NUM; });
        if (sr2 && sr2.owned && !before.length) add('red', 'form', '기설 의심', { mac: mac, meters: [head.INSTR_NUM] });
      }
      // 마스터 — 등록수·DCU·계기유형·통신방식
      var expSuf = '';
      if (master) {
        var mNo = master.INSTR_NUM;
        if (ms.length) {
          var b = bound[mNo + '|' + mac] || {}, nb = Object.keys(b).length + (b[mNo] ? 0 : 1);
          var f = parseFloat(master.MB_REG_CNT || 0), reg = isNaN(f) ? -1 : Math.trunc(f);
          if (reg !== nb) add('red', 'form', '등록수 다름', { mac: mac, meters: [mNo], data: reg + ' / ' + nb });
          if (div === 'M1010' && mac.indexOf('012') !== 0 && !master.DCU_ID) add('red', 'form', 'DCU 없음', { mac: mac, meters: [mNo] });
        }
        var expM = wcInferM(mNo), expS = wcInferS(expM, mac);
        expSuf = expS ? expS.slice(-2) : String(master.INST_S || '').slice(-2);
        if (ms.length) {
          if ((master.INST_M || '') !== expM) add('red', 'comm', '계기유형 오류', { mac: mac, meters: [mNo], data: (master.INST_M || '-') + ' / ' + expM });
          if (!expS) add('yellow', 'comm', '통신방식 미상', { mac: mac, meters: [mNo] });
          else if ((master.INST_S || '') !== expS) add('red', 'comm', '통신방식 오류', { mac: mac, meters: [mNo], data: (master.INST_S || '-') + ' / ' + expS });
          if (mac.indexOf('012') === 0) {
            var amigoMeter = expM === 'HW4050', amigoModem = stockKind(mac).indexOf('AMIGO') >= 0;
            if (amigoMeter !== amigoModem) add('red', 'comm', '아미고 짝', { mac: mac, meters: [mNo], data: stockKind(mac) });
          }
        }
      }
      // 슬레이브
      ss.forEach(function (r) {
        var no = r.INSTR_NUM;
        if ((mdiv === 'M1010' || mdiv === 'M1030') && r.WORK_DIV !== 'M1010') add('red', 'form', '슬레이브 구분', { mac: mac, meters: [no] });
        var mb = r.MB_METER_ID || '', mrow = byMeterMaster[mb];
        if (mb && mrow && wcUp(mrow.MAC_MODEM) !== mac) add('red', 'form', '슬레이브 맥 다름', { mac: mac, meters: [no] });
        if (master && mb && mb !== master.INSTR_NUM && !mrow) {
          // 영준님이 일부러 쓰는 방법 — 다른 날 마스터에 슬레이브를 더할 때 대표계기 칸에 자기 번호
          if (mb === no && master.WORK_DATE !== day) add('green', 'form', '대표계기 자기 번호', { mac: mac, meters: [no], data: master.INSTR_NUM });
          else add('red', 'form', '대표계기 다름', { mac: mac, meters: [no], data: mb + ' / ' + master.INSTR_NUM });
        }
        var em = wcInferM(no);
        if ((r.INST_M || '') !== em) add('red', 'comm', '계기유형 오류', { mac: mac, meters: [no], data: (r.INST_M || '-') + ' / ' + em });
        if (expSuf && (r.INST_S || '') !== em + expSuf) add('red', 'comm', '통신방식 오류', { mac: mac, meters: [no], data: (r.INST_S || '-') + ' / ' + em + expSuf });
        var d = det[no];
        if (!d || d._err || !Object.prototype.hasOwnProperty.call(d, 'BUNGI')) add('grey', 'comm', '분기 미확인', { mac: mac, meters: [no] });
        else {
          var sb = wcSlaveBungi(expSuf, em), bg = String(d.BUNGI || '');
          if ((sb[1] && WC_BUNGI.indexOf(bg) < 0) || (!sb[1] && bg !== sb[0])) add('red', 'comm', '분기 오류', { mac: mac, meters: [no], data: (bg || '-') + ' / ' + (sb[1] ? '무선·0.5' : '0.5') });
        }
      });
      wcSuffixDups(master, rs, rows, mac, expSuf, det).forEach(function (x) {
        add('red', 'comm', '뒷자리 중복', { mac: mac, meters: x[1], data: '끝 ' + x[0] });
      });
      // 지사·리스트
      var dept = head.DEPT2 || '', inList = [], outList = [], keys = {};
      rs.forEach(function (r) {
        var xs = L[r.INSTR_NUM] || [];
        if (!xs.length && String(r.MODEM_DIV) === '10' && r.WORK_DIV === 'M1030') return;   // 기설 마스터 = 원래 리스트 밖
        (xs.length ? inList : outList).push(r.INSTR_NUM);
        xs.forEach(function (x) {
          keys[x.a + '|' + x.c] = 1;
          touched[x.a + '|' + x.c] = 1;
          if (WC_DEPT_NM[dept] && x.j.indexOf(WC_DEPT_NM[dept]) !== 0) add('red', 'form', '지사 다름', { mac: mac, meters: [r.INSTR_NUM], data: WC_DEPT_NM[dept] + ' / ' + x.j });
        });
      });
      // 번호 1자리 차이 후보 주소 = 이 모뎀에 묶인 다른 날 리스트 계기 주소도 포함
      if (outList.length) {
        wcMembers(master, rs, rows, mac).forEach(function (r) { (L[r.INSTR_NUM] || []).forEach(function (x) { keys[x.a + '|' + x.c] = 1; }); });
        deferred.push({ mac: mac, outList: outList, keys: keys });
      }
    });
    // 같은 주소 리스트 계기 — 번호 1자리 차이 / 누락 후보
    var need = {};
    deferred.forEach(function (g) { for (var k in g.keys) need[k] = 1; });
    for (var k0 in touched) need[k0] = 1;
    var SM = inp.si ? wcSiteMeters(inp.si, inp.names || {}, need) : {};
    var typoList = {};
    deferred.forEach(function (g) {
      var rest = [];
      g.outList.forEach(function (m) {
        var fm = wcFold(m), hit = [];
        for (var k in g.keys) (SM[k] || []).forEach(function (x) {
          if (x !== m && hit.indexOf(x) < 0 && wcOneOff(fm, wcFold(x))) hit.push(x);
        });
        if (!hit.length) { rest.push(m); return; }
        hit.sort();
        var miss = hit.filter(function (x) { return !aw[x]; });
        miss.forEach(function (x) { typoList[x] = 1; });
        add(miss.length ? 'red' : 'yellow', 'list', '번호 1자리 차이', { mac: g.mac, meters: [m].concat(miss.length ? miss : hit) });
      });
      if (rest.length) add('yellow', 'list', '리스트 밖', { mac: g.mac, meters: rest });
    });
    Object.keys(touched).sort().forEach(function (k) {
      var all = SM[k] || [], miss = all.filter(function (x) { return !aw[x] && !typoList[x]; }).sort();
      if (miss.length) add('yellow', 'list', '누락 후보', { meters: miss, addr: k.split('|')[0], data: ((inp.names || {})[k.split('|')[1]] || k.split('|')[1]) + ' · 리스트 ' + all.length + ' / 미등록 ' + miss.length });
    });
    // 모뎀 사용(신설 마스터, 종류별) · 일별 작업 현황
    var use = {}, used = {};
    today.forEach(function (r) {
      if (String(r.MODEM_DIV) === '10' && r.WORK_DIV === 'M1010' && !used[r.INSTR_NUM]) { used[r.INSTR_NUM] = 1; var kd = stockKind(wcUp(r.MAC_MODEM)); use[kd] = (use[kd] || 0) + 1; }
    });
    var dayMap = {};
    rows.forEach(function (r) {
      var wd = r.WORK_DATE;
      if (!wd || wd > day) return;
      var D = dayMap[wd] = dayMap[wd] || { day: wd, masters: 0, slaves: 0, macs: {}, sites: {} };
      if (String(r.MODEM_DIV) === '10') D.masters++; else D.slaves++;
      var mac = wcUp(r.MAC_MODEM), xs = L[r.INSTR_NUM] || [];
      if (xs.length) { D.sites[xs[0].a] = 1; D.macs[mac] = 'site'; } else if (!D.macs[mac]) D.macs[mac] = 'none';
    });
    var days = Object.keys(dayMap).sort().reverse().slice(0, 7).map(function (d) {
      var D = dayMap[d], noSite = 0;
      for (var m in D.macs) if (D.macs[m] === 'none') noSite++;
      return { day: d, masters: D.masters, slaves: D.slaves, sites: Object.keys(D.sites).length, noSite: noSite };
    });
    return { items: items, sum: sum, use: use, days: days };
  }
  // [v102-wc-end]

  var __wc = { day: '', rows: null, rowsYear: '', si: null, det: {}, res: null, err: '' };
  function wcFmtDay(d) {
    var w = '일월화수목금토'.charAt(new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))).getUTCDay());
    return d.slice(4, 6) + '/' + d.slice(6) + ' (' + w + ')';
  }
  function wcShift(d, n) {
    var t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)) + n * 86400000);
    return t.toISOString().slice(0, 10).replace(/-/g, '');
  }
  function wcLoadSI() {
    if (__wc.si) return Promise.resolve(__wc.si);
    return fetch('https://815dudwns.github.io/ami-work/data/search-index.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('리스트 HTTP ' + r.status); return r.json(); })
      .then(function (j) { __wc.si = j; return j; });
  }
  function wcLoadNames() {
    return new Promise(function (ok) {
      var done = false, fin = function () { if (!done) { done = true; ok(LIST_NAMES); } };
      try { loadMeterIndex(fin); } catch (e) { fin(); }
      setTimeout(fin, 15000);
    });
  }
  function wcDetail(r) {
    var q = 'FLAG=M10&DEPT1=' + encodeURIComponent(r.DEPT1 || '3970') + '&BUSI_NUM=' + encodeURIComponent(r.BUSI_NUM || '') +
      '&DATA_NUM=' + encodeURIComponent(r.DATA_NUM || '') + '&EXT_DCU_ID=&INSTR_NUM=' + encodeURIComponent(r.INSTR_NUM || '') +
      '&MAC_MODEM=' + encodeURIComponent(r.MAC_MODEM || '') + '&EXT_FCTY_ID=' + encodeURIComponent(r.EXT_FCTY_ID || '');   // ★'-' 그대로
    return stockGet('/ami/mob/cst/mobCst1000/getDetail?' + q, 'MOBCST')
      .then(function (d) { return Array.isArray(d) ? (d[0] || {}) : (d || {}); })
      .catch(function (e) { return { _err: String(e && e.message || e) }; });
  }
  function wcDetails(list) {
    var todo = list.filter(function (r) { return !__wc.det[r.INSTR_NUM]; }), i = 0;
    var worker = function () {
      if (i >= todo.length) return Promise.resolve();
      var r = todo[i++];
      return wcDetail(r).then(function (d) { __wc.det[r.INSTR_NUM] = d; return worker(); });
    };
    return Promise.all([worker(), worker(), worker(), worker()]);
  }
  function wcRun(day, fresh) {
    __wc.day = day; __wc.res = null; __wc.err = '';
    if (fresh) { __wc.rows = null; __wc.det = {}; }
    wcRender();
    var year = day.slice(0, 4), today = stockYmd();
    var rowsP = (__wc.rows && __wc.rowsYear === year) ? Promise.resolve(__wc.rows)
      : stockMain(year + '0101', year === today.slice(0, 4) ? today : year + '1231').then(function (rs) { __wc.rows = rs; __wc.rowsYear = year; return rs; });
    var stockP = (__stock.data && __stock.data.build) ? Promise.resolve(__stock.data.build) : new Promise(function (ok) {
      var n = 0, t = setInterval(function () { n++; if ((__stock.data && __stock.data.build) || n > 90) { clearInterval(t); ok(__stock.data && __stock.data.build); } }, 500);
    });
    Promise.all([rowsP, wcLoadSI(), wcLoadNames(), stockP]).then(function (a) {
      var rows = a[0];
      return wcDetails(wcDetailWants(day, rows)).then(function () {
        var b = a[3] || {}, off = {};
        (b.off || []).forEach(function (o) { off[o.mac] = 1; });
        var res = wcCheck({ day: day, rows: rows, details: __wc.det, own: b.own || {}, off: off, si: a[1], names: a[2] });
        res.stock = b.counts || null;
        __wc.res = res;
        var n = { red: 0, yellow: 0 };
        res.items.forEach(function (x) { if (n[x.lv] != null) n[x.lv]++; });
        rec({ stage: 'wc-run', day: day, meters: res.sum.meters, red: n.red, yellow: n.yellow, noStock: !a[3] });
        wcRender();
      });
    }).catch(function (e) { __wc.err = String(e && e.message || e); rec({ stage: 'wc-fail', day: day, msg: __wc.err }); wcRender(); });
  }
  var WC_DOT = { red: '#f04438', yellow: '#f79009', green: '#12b76a', grey: '#98a2b3' };
  var WC_SECS = [['list', '리스트 대조'], ['comm', '통신방식·분기'], ['form', '등록 형식']];
  function wcRender() {
    var box = document.getElementById('__wc_body');
    if (!box) return;
    var dl = document.getElementById('__wc_day');
    if (dl) dl.textContent = wcFmtDay(__wc.day);
    if (__wc.err) { box.innerHTML = '<div style="padding:16px;color:#d92d20;font-weight:700">조회 실패</div>'; return; }
    var R = __wc.res;
    if (!R) { box.innerHTML = '<div style="padding:20px;text-align:center;color:#667085">조회 중…</div>'; return; }
    var esc = stockEsc, h = '', n = { red: 0, yellow: 0 }, badMac = {};
    R.items.forEach(function (x) { if (n[x.lv] != null) { n[x.lv]++; if (x.mac) badMac[x.mac] = 1; } });
    var okN = Math.max(0, R.sum.modems - Object.keys(badMac).length);
    var chip = function (v, t, c) { return '<div style="flex:1;background:#fff;border:1px solid #eaecf0;border-radius:10px;text-align:center;padding:7px 0;font-size:12px;color:#475467"><b style="display:block;font-size:19px;color:' + c + '">' + v + '</b>' + t + '</div>'; };
    h += '<div style="display:flex;gap:6px;margin-bottom:10px">' + chip(okN, '정상 모뎀', '#067647') + chip(n.yellow, '확인', '#b54708') + chip(n.red, '조치', '#d92d20') + '</div>';
    var dv = R.sum.div, dn = { M1010: '신설', M1030: '기설', M1020: '교체' };
    h += '<div style="font-size:12px;color:#475467;margin:0 2px 10px">계기 ' + R.sum.meters + ' · 마스터 ' + R.sum.masters + ' · 슬레이브 ' + R.sum.slaves +
      Object.keys(dv).map(function (k) { return ' · ' + (dn[k] || k) + ' ' + dv[k]; }).join('') + '</div>';
    var rank = { red: 0, yellow: 1, grey: 2, green: 3 };
    WC_SECS.forEach(function (s) {
      var xs = R.items.filter(function (x) { return x.sec === s[0]; }).sort(function (a, b) { return rank[a.lv] - rank[b.lv]; });
      h += '<div style="background:#fff;border:1px solid #eaecf0;border-radius:12px;margin-bottom:10px;overflow:hidden">' +
        '<div style="padding:8px 10px;font-size:14px;font-weight:700;background:#f2f4f7;color:#344054">' + s[1] + '</div>';
      if (!xs.length) h += '<div style="display:flex;gap:8px;padding:8px 10px;font-size:14px"><span style="width:10px;height:10px;border-radius:50%;margin-top:5px;background:#12b76a;flex:none"></span><b>이상 없음</b></div>';
      xs.forEach(function (x) {
        var dat = (x.meters || []).join(' / ') + (x.addr ? ' · ' + x.addr : '') + (x.data ? ' · ' + x.data : '') + (x.mac && !x.addr ? ' · ' + x.mac : '');
        h += '<div style="display:flex;gap:8px;padding:8px 10px;border-top:1px solid #f2f4f7;font-size:14px;align-items:flex-start">' +
          '<span style="width:10px;height:10px;border-radius:50%;margin-top:5px;background:' + WC_DOT[x.lv] + ';flex:none"></span><div style="min-width:0">' +
          '<div style="font-weight:700">' + esc(x.kind) + '</div><div style="font-family:monospace;font-size:12px;color:#344054;word-break:break-all">' + esc(dat) + '</div>' +
          (x.todo ? '<div style="font-size:12px;color:#d92d20;margin-top:2px">' + esc(x.todo) + '</div>' : '') + '</div></div>';
      });
      h += '</div>';
    });
    var td = 'padding:6px 6px;border-top:1px solid #f2f4f7;text-align:right;white-space:nowrap;';
    var c = R.stock || {}, tu = 0, th = 0, rowsH = '';
    STOCK_ROWS.forEach(function (r) {
      var u = R.use[r[0]] || 0, v = c[r[0]] ? c[r[0]].awms + c[r[0]].off : 0;
      tu += u; th += v;
      if (u || v) rowsH += '<tr><td style="' + td + 'text-align:left">' + esc(r[1]) + '</td><td style="' + td + '">' + u + '</td><td style="' + td + '">' + v + '</td></tr>';
    });
    Object.keys(R.use).forEach(function (k) {
      if (!STOCK_ROWS.some(function (r) { return r[0] === k; })) { tu += R.use[k]; rowsH += '<tr><td style="' + td + 'text-align:left">' + esc(k) + '</td><td style="' + td + '">' + R.use[k] + '</td><td style="' + td + '">-</td></tr>'; }
    });
    h += '<div style="background:#fff;border:1px solid #eaecf0;border-radius:12px;margin-bottom:10px;overflow:hidden"><div style="padding:8px 10px;font-size:14px;font-weight:700;background:#f2f4f7;color:#344054">모뎀 사용</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="color:#475467"><th style="' + td + 'text-align:left">자재</th><th style="' + td + '">신설</th><th style="' + td + '">재고</th></tr>' + rowsH +
      '<tr style="font-weight:800"><td style="' + td + 'text-align:left">총계</td><td style="' + td + '">' + tu + '</td><td style="' + td + '">' + (R.stock ? th : '-') + '</td></tr></table></div>';
    h += '<div style="background:#fff;border:1px solid #eaecf0;border-radius:12px;margin-bottom:6px;overflow:hidden"><div style="padding:8px 10px;font-size:14px;font-weight:700;background:#f2f4f7;color:#344054">일별 작업 현황</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="color:#475467"><th style="' + td + 'text-align:left">일자</th><th style="' + td + '">개소</th><th style="' + td + '">마스터</th><th style="' + td + '">슬레이브</th></tr>';
    R.days.forEach(function (d) {
      h += '<tr' + (d.day === __wc.day ? ' style="font-weight:800"' : '') + '><td style="' + td + 'text-align:left">' + wcFmtDay(d.day) + '</td><td style="' + td + '">' + d.sites + (d.noSite ? ' +' + d.noSite : '') +
        '</td><td style="' + td + '">' + d.masters + '</td><td style="' + td + '">' + d.slaves + '</td></tr>';
    });
    h += '</table></div><div style="font-size:11px;color:#98a2b3;margin:0 2px 12px">awms 등록 기준 · 사진 판독 없음 · 개소 +N = 리스트 밖 모뎀</div>';
    box.innerHTML = h;
  }
  function wcPanelHtml() {
    return '<div id="__wc_panel" style="display:none;margin-bottom:12px">' +
      '<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">' +
      '<button id="__wc_prev" style="height:36px;border:1px solid #d0d5dd;border-radius:9px;background:#fff;padding:0 10px;font-size:13px">이전</button>' +
      '<div id="__wc_day" style="flex:1;text-align:center;font-weight:800;font-size:16px;background:#fff;border:1px solid #d0d5dd;border-radius:9px;height:36px;line-height:36px"></div>' +
      '<button id="__wc_next" style="height:36px;border:1px solid #d0d5dd;border-radius:9px;background:#fff;padding:0 10px;font-size:13px">다음</button>' +
      '<button id="__wc_reload" style="height:36px;border:1px solid #d0d5dd;border-radius:9px;background:#fff;padding:0 10px;font-size:13px">새로고침</button></div>' +
      '<div id="__wc_body"></div></div>';
  }
  function wcWire(ov) {
    var btn = ov.querySelector('#__wc_btn');
    if (!btn) return;
    var panel = ov.querySelector('#__wc_panel');
    btn.onclick = function () {
      var open = panel.style.display === 'none';
      panel.style.display = open ? 'block' : 'none';
      if (open && !__wc.res && !__wc.err) { rec({ stage: 'wc-open' }); wcRun(__wc.day || stockYmd(), false); }
    };
    ov.querySelector('#__wc_prev').onclick = function () { wcRun(wcShift(__wc.day || stockYmd(), -1), false); };
    ov.querySelector('#__wc_next').onclick = function () { var t = stockYmd(), d = wcShift(__wc.day || t, 1); if (d <= t) wcRun(d, false); };
    ov.querySelector('#__wc_reload').onclick = function () { wcRun(__wc.day || stockYmd(), true); };
  }
  // ===== [v102] 작업 검사 END =====

  function openStockPage() {
    if (document.getElementById('__helper_stock')) return;
    __stock.me = stockMe();
    if (!__stock.me) return;
    __stock.pending = [];
    var ov = document.createElement('div');
    ov.id = '__helper_stock';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#f9fafb;overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#101828;' +
      'padding:calc(env(safe-area-inset-top,0px) + 12px) 12px calc(env(safe-area-inset-bottom,0px) + 24px);box-sizing:border-box;';
    ov.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
      '<div style="font-size:20px;font-weight:800;flex:1">자재 현황 <span style="font-size:11px;color:#98a2b3;font-weight:400">시험판 ' + VER + '</span></div>' +
      '<button id="__stock_reload" style="height:36px;border:1px solid #d0d5dd;border-radius:9px;background:#fff;padding:0 10px;font-size:13px">새로고침</button>' +
      '<button id="__stock_close" style="height:36px;border:0;border-radius:9px;background:#1e3a8a;color:#fff;padding:0 12px;font-size:13px;font-weight:700">닫기</button></div>' +
      '<button id="__stock_addbtn" style="width:100%;height:44px;border:0;border-radius:10px;background:#175cd3;color:#fff;font-size:15px;font-weight:800;margin-bottom:10px">자재 등록</button>' +
      stockAddPanelHtml() +
      (TESTER_IDS.indexOf(String(__stock.me)) > -1 ?   // [v102] 작업 검사 — 테스터 전용
        '<button id="__wc_btn" style="width:100%;height:44px;border:1px solid #175cd3;border-radius:10px;background:#fff;color:#175cd3;font-size:15px;font-weight:800;margin-bottom:10px">작업 검사</button>' + wcPanelHtml() : '') +
      '<div id="__stock_body"></div>';
    document.body.appendChild(ov);
    ov.querySelector('#__stock_close').onclick = function () {
      if (__stock.pending.some(function (p) { return p.st === 'ok'; }) && !confirm('미등록 자재 있음 · 닫기')) return;
      window.__stockScanCb = null; ov.remove();
    };
    ov.querySelector('#__stock_reload').onclick = stockLoad;
    stockWireAddPanel(ov);
    wcWire(ov);
    rec({ stage: 'stock-open' });
    stockLoad();
  }
  window.__openStockPage = openStockPage;
  // [v101] 헬퍼 첫 화면 [자재 현황] — 앱이 표시를 남기면 로그인 뒤 세션 아이디가 잡히는 순간 연다(1.0.82~)
  try {
    if (window.AndroidNav && AndroidNav.peekOpenStock && AndroidNav.peekOpenStock() && location.pathname.indexOf('/login.html') < 0) {
      var stkTries = 0;
      var stkTimer = setInterval(function () {
        stkTries++;
        if (stockMe()) {
          clearInterval(stkTimer);
          try { AndroidNav.takeOpenStock(); } catch (e) {}
          openStockPage();
        } else if (stkTries > 60) clearInterval(stkTimer);
      }, 1000);
    }
  } catch (e) {}
  // ===== [v97] 자재관리 END =====

})();
