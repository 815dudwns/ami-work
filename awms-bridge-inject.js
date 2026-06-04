// awms-bridge 리모컨 — QRCODE/BARCODE 클릭 → 네이티브 구글 스캐너(ML Kit) → 검증 parseValue로 추출 → 타겟 칸 입력.
// 타겟 칸 = awms Vue(__vue__)의 vFlmnCl (modalOpen('FIELD')가 세팅).
//   - 모뎀맥/맥 계열(MAC/MODEM) → parseValue.value 를 012+끝8 변환
//   - 계기번호/대표계기(INSTR_NUM/METER_ID), DCU_ID → parseValue.value 그대로
// parseValue = ami-work/js/awms-parseValue.js (awms 원본 검증본) 인라인. OCR은 awms 원본.

(function () {
  'use strict';
  var VER = 'v64'; // v64: 대표계기→계기번호 자동복사 옵션(마스터 전용) / v63: 시공전 addRow 후킹

  // firebase RTDB(awmslog/helper) — helper는 AndroidRecorder 없어 logcat 안 남음.
  // RTDB는 awms.kdn.com CORS 열림(확인됨). 시공전 디버깅용. 사용자 소수 + 무한 배포 전제.
  var _FBLOG = 'https://ami-jongno-default-rtdb.asia-southeast1.firebasedatabase.app/awmslog/helper.json';
  // [v61] firebase 로그 화이트리스트 — 핵심만 보냄(진단 폭주 차단). 디버깅 필요시 window.__FBLOG_ALL=true 로 전체.
  var _FBLOG_KEEP = { 'master-photo-saved': 1, 'slave-photo-copy': 1, 'boot': 1, 'slave-a3-inject': 1, 'addrow-life': 1, 'a4-clear': 1, 'addrow-hook-on': 1, 'mb-to-meter': 1 };
  function rec(o) {
    try {
      o.kind = 'cam'; o.ts = Date.now(); o.url = 'https://awms.kdn.com/__cam__/' + (o.stage || '');
      if (window.AndroidRecorder && window.AndroidRecorder.record) window.AndroidRecorder.record(JSON.stringify(o));
    } catch (e) {}
    try {
      if (!window.__FBLOG_ALL && !_FBLOG_KEEP[o.stage]) return; // 진단 stage는 firebase 안 보냄(폭주 차단)
      fetch(_FBLOG, { method: 'POST', headers: { 'Content-Type': 'application/json' },
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
                var exp = /^\*\d{11}\*$/;
                var clearedText = text.split(" ").join("");
                if(exp.test(clearedText)) {
                    parsedText = clearedText.split("*").join("");
                }
            }
            else if(text.split(" ").join("").length == 11) {
                var exp = /\d{11}/;
                var clearedText = text.split(" ").join("");
                if(exp.test(clearedText)) {
                    parsedText = clearedText;
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
          // password input 있는 폼과 연관된 경우만
          var f = detectLoginFields();
          if (f) saveCurrentCred();
        }
      } catch (e) {}
    }, true); // 캡처 단계

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
    }
  } catch (e) {}

  window.__onNativeScan = function (raw) {
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
        return;
      } catch (e) { rec({ stage: 'inject-vue-fail', msg: String(e) }); }
    }
    var input = findInputByField(field);
    if (input) {
      setInput(input, val);
      rec({ stage: 'inject-dom', field: field });
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
          if (txt === 'QRCODE' || txt === 'BARCODE') {
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
  function applyDeptWith(vm) {
    try {
      var row = vm && vm.mainList && vm.mainList.currentRow;
      if (!row) return;
      dumpDeptOptions(vm);
      if (window.__awmsHelper) {
        // 헬퍼 모드: localStorage 마지막 저장값 복원. 피드백 루프 없음 — 저장 버튼 클릭 시에만 기록.
        var ld = localStorage.getItem('helper_last_dept');
        var lw = localStorage.getItem('helper_last_with');
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
  // 모뎀맥 스캔값 → 통신방식 suffix. LTE(012)는 별도, hex MAC prefix는 결론문서 §3.
  function macToSuffix(mac) {
    var raw = String(mac || '');
    if (/^012\d{8}$/.test(raw.replace(/\D/g, ''))) return 'LTE';
    var m = raw.toUpperCase().replace(/[^0-9A-F]/g, '');
    if (/^847207/.test(m)) { var c = m.charAt(6); if (c === '0' || c === 'E') return '90'; if (c === 'B' || c === 'C' || c === 'D') return '10'; }
    if (/^E0AEED/.test(m)) return '10';                       // ks-plc
    if (/^44B433/.test(m) || /^0014B0/.test(m)) return '20';  // hpgp
    if (/^AC5E8C/.test(m)) return 'SKIP';                     // 혼재(K-DCU67/PLC27) → 자동 안 함, 직접 선택
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
    if (row.MB_METER_ID && !row.INSTR_NUM) {               // 대표계기 있고 계기번호 빈칸일 때만(수동값 보존)
      setRow(vm, row, 'INSTR_NUM', row.MB_METER_ID);
      rec({ stage: 'mb-to-meter', v: row.MB_METER_ID });
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
      vm.$watch('mainList.currentRow.MAC_MODEM', function () { setTimeout(function () { applyCommBungi(vm); }, 200); });
      vm.$watch('mainList.currentRow.INST_M', function () { setTimeout(function () { applyCommBungi(vm); }, 300); });
      vm.$watch('mainList.currentRow.MODEM_DIV', function () { setTimeout(function () { applyCommBungi(vm); applyMbToMeter(vm); }, 150); });
      vm.$watch('mainList.currentRow.MB_METER_ID', function () { applyMbToMeter(vm); });   // [v64] 대표계기 입력 → 계기번호 자동
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
        x.open = function (m, u) { x.__u = u; if (String(u).indexOf('saveAct') > -1) rec({ stage: 'xhr-open' }); return oOpen.apply(x, arguments); };
        var oSend = x.send;
        x.send = function () {
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
        // [v63] 기존 callback/set polling 주입은 제거 — awms가 덮어써 실패(영준님 "안 따라옴"). addRow 후킹(행 생성 시점)으로 대체.
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
})();
