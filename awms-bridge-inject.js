// awms-bridge 리모컨 — QRCODE/BARCODE 클릭 → 네이티브 구글 스캐너(ML Kit) → 검증 parseValue로 추출 → 타겟 칸 입력.
// 타겟 칸 = awms Vue(__vue__)의 vFlmnCl (modalOpen('FIELD')가 세팅).
//   - 모뎀맥/맥 계열(MAC/MODEM) → parseValue.value 를 012+끝8 변환
//   - 계기번호/대표계기(INSTR_NUM/METER_ID), DCU_ID → parseValue.value 그대로
// parseValue = ami-work/js/awms-parseValue.js (awms 원본 검증본) 인라인. OCR은 awms 원본.

(function () {
  'use strict';
  var VER = 'v35-noxhrperm';

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
    try { if (j && j.atchFileId3) { window.__masterPhoto3 = j.atchFileId3; rec({ stage: 'master-photo-saved', f3: j.atchFileId3 }); } } catch (e) {}
  }
  try {
    if (false && !window.__xhrHooked) {   // [v35] XHR 래핑 영구 제거 — 시공전 사진은 currentRow polling(v31)이 대체, 계기팀 saveRow(MOBMTR) 충돌 방지
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
    if (false && !window.__fetchHooked && window.fetch) {   // [v35] fetch 래핑도 영구 제거 (시공전 사진은 polling 대체)
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

  // 사진 공유 polling — 슬래이브 시공전 칸이 비면 마스터 저장 파일ID로 채움 (미리보기도 파일ID로 표시됨)
  try {
    setInterval(function () {
      try {
        var vm = getAwmsVM(); if (!vm || !vm.mainList) return;
        var r = vm.mainList.currentRow; if (!r) return;
        var md = String(r.MODEM_DIV || '');
        if (md === '10' && r.ATCH_FILE_ID_3) { window.__masterPhoto3 = r.ATCH_FILE_ID_3; }  // 마스터 폼의 시공전 파일ID 직접 기억(응답 아님)
        if (md === '20' && !r.ATCH_FILE_ID_3 && window.__masterPhoto3) {
          // awms 정식 사진등록 호출(innorixFileUploadSingleCallback)로 시공전(ATCH_FILE3) 주입 — 미리보기/저장 일관
          if (typeof vm.innorixFileUploadSingleCallback === 'function') {
            vm.innorixFileUploadSingleCallback({ id: 'ATCH_FILE3', status: 'uploadComplete', ATCH_FILE_ID: window.__masterPhoto3 });
            rec({ stage: 'slave-photo-copy', f3: window.__masterPhoto3, via: 'callback' });
          } else {
            if (typeof vm.$set === 'function') vm.$set(r, 'ATCH_FILE_ID_3', window.__masterPhoto3); else r.ATCH_FILE_ID_3 = window.__masterPhoto3;
            rec({ stage: 'slave-photo-copy', f3: window.__masterPhoto3, via: 'set' });
          }
        }
      } catch (e) {}
    }, 1200);
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
              var normal = pickNormalBackCamera(devices);
              if (normal) {
                var nv = (typeof v === 'object' && v) ? Object.assign({}, v) : {};
                delete nv.facingMode;
                nv.deviceId = { exact: normal.deviceId };
                rec({ stage: 'cam-hook', label: normal.label });
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
