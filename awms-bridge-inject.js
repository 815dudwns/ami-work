// awms-bridge 리모컨 — QRCODE/BARCODE 클릭 → 네이티브 구글 스캐너(ML Kit) → 검증 parseValue로 추출 → 타겟 칸 입력.
// 타겟 칸 = awms Vue(__vue__)의 vFlmnCl (modalOpen('FIELD')가 세팅).
//   - 모뎀맥/맥 계열(MAC/MODEM) → parseValue.value 를 012+끝8 변환
//   - 계기번호/대표계기(INSTR_NUM/METER_ID), DCU_ID → parseValue.value 그대로
// parseValue = ami-work/js/awms-parseValue.js (awms 원본 검증본) 인라인. OCR은 awms 원본.

(function () {
  'use strict';
  var VER = 'v15-commtype';

  function rec(o) {
    try {
      o.kind = 'cam'; o.ts = Date.now(); o.url = 'https://awms.kdn.com/__cam__/' + (o.stage || '');
      if (window.AndroidRecorder && window.AndroidRecorder.record) window.AndroidRecorder.record(JSON.stringify(o));
    } catch (e) {}
  }

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

  // 모뎀맥: parseValue 결과(자재ID 등) → 012 + 끝8자리
  function modemTo012(v) {
    var s = String(v || '').trim();
    if (/^012\d{8}$/.test(s)) return s;
    var d = s.replace(/\D/g, '');
    if (/^012\d{8}$/.test(d)) return d;
    if (d.length >= 8) return '012' + d.slice(-8);
    return d || s;
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

  try {
    if (location.host.indexOf('awms') > -1 && !document.getElementById('__inject_badge')) {
      var show = function () {
        if (!document.body || document.getElementById('__inject_badge')) return;
        var b = document.createElement('div');
        b.id = '__inject_badge'; b.textContent = '리모컨 ' + VER + (window.AndroidScanner ? ' [스캐너O]' : ' [스캐너X]');
        b.style.cssText = 'position:fixed;top:env(safe-area-inset-top,0);left:0;z-index:2147483647;background:#16a34a;color:#fff;font:11px -apple-system,sans-serif;padding:3px 8px;border-bottom-right-radius:6px;opacity:.85';
        document.body.appendChild(b);
        setTimeout(function () { try { b.remove(); } catch (e) {} }, 3000);
      };
      if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
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

  // ── 헬퍼: 설비등록 폼 자동선택 (지사/동행) — 통신팀 기본값. 추후 __TEAM/앱설정으로 분기/on·off ──
  var TEAM_DEFAULTS = { DEPT2: '7793', MTR_WITH_YN: 'Y' };   // 통신팀(종로/서울본부직할). 계기팀=N+다른지사
  function setRow(vm, row, key, val) {
    if (row[key]) return;                                     // 빈 칸일 때만 — 수동/기존값 보존
    if (typeof vm.$set === 'function') vm.$set(row, key, val); else row[key] = val;
  }
  function applyDeptWith(vm) {
    try {
      var row = vm && vm.mainList && vm.mainList.currentRow;
      if (!row) return;
      setRow(vm, row, 'DEPT2', TEAM_DEFAULTS.DEPT2);
      setRow(vm, row, 'MTR_WITH_YN', TEAM_DEFAULTS.MTR_WITH_YN);
      rec({ stage: 'auto-deptwith', DEPT2: row.DEPT2, WITH: row.MTR_WITH_YN });
    } catch (e) {}
  }

  // ── 통신방식/분기 자동선택 (계기번호+맥 입력 후) ──
  // 마스터(MODEM_DIV=10): INST_S = 계기타입+맥 추론. 슬래이브(20): 직전 마스터 통신방식 따라옴.
  // 분기: 슬래이브가 아미고면 무선·아니면 0.5. (PLC는 site-data 통신방식 매핑 단계에서 확장 — __commMap)
  // INST_S suffix: 10=ks-plc 20=hpgp 40=LTE 70=lte_IV 80=iot-plc 90=k-dcu 92=smgw-c
  var lastMasterINST_S = '';
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
  function inferMasterINST_S(instM, mac, meterNo) {
    if (!instM) return '';
    if (macIsLte(mac)) return isAmigo(instM) ? instM + '92' : instM + '70';  // 실제 맥이 LTE면 우선
    // 비LTE → site-data 통신방식 매핑 (PLC/DCU/HPGP). __commMap 로드돼 있으면.
    if (window.__commMap && meterNo && window.__commMap[meterNo]) {
      var suf = commToSuffix(window.__commMap[meterNo]);
      if (suf) return instM + suf;
    }
    return '';  // 미상 → 비워둠(영준님 직접 선택)
  }
  function setSelectVal(vm, row, key, val, selName) {
    if (!val || row[key]) return;                          // 빈 칸일 때만 — 수동값 보존
    var tries = 0;
    (function w() {
      if (typeof vm.$set === 'function') vm.$set(row, key, val); else row[key] = val;
      var sel = document.querySelector('select[name="' + selName + '"]');
      if (sel && String(sel.value) === String(val)) return;  // select 반영 확인
      if (++tries < 12) setTimeout(w, 150);                  // INST_S 옵션 비동기 로드 대기
    })();
  }
  function applyCommBungi(vm) {
    try {
      var row = vm && vm.mainList && vm.mainList.currentRow;
      if (!row) return;
      var instM = row.INST_M, mac = row.MAC_MODEM, modem = String(row.MODEM_DIV || ''), meter = row.INSTR_NUM;
      if (modem === '20') {                                 // 슬래이브: 직전 마스터 통신방식 따라옴
        setSelectVal(vm, row, 'INST_S', lastMasterINST_S, '통신방식');
        setSelectVal(vm, row, 'BUNGI', isAmigo(instM) ? '무선' : '0.5', '분기기');
        rec({ stage: 'auto-comm-slave', INST_S: row.INST_S, BUNGI: row.BUNGI });
      } else if (modem === '10') {                          // 마스터
        var s = inferMasterINST_S(instM, mac, meter);
        if (s) { setSelectVal(vm, row, 'INST_S', s, '통신방식'); lastMasterINST_S = s; rec({ stage: 'auto-comm-master', INST_S: s }); }
      }
    } catch (e) {}
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
      vm.$watch('mainList.currentRow.MODEM_DIV', function () { setTimeout(function () { applyCommBungi(vm); }, 150); });
    } catch (e) {}
    rec({ stage: 'helper-installed' });
    return true;
  }
  try {
    var __t = 0, __iv = setInterval(function () {
      if (installHelper() || ++__t > 40) clearInterval(__iv);
    }, 1000);
  } catch (e) {}
})();
