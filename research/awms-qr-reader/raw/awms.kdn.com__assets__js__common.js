/********************************************************************************************
 * vue 관련 공통 설정
 ********************************************************************************************/
var staticVue = new Vue();
var globalSession = getSession();
var globalDefaultInfo = getDefaultInfo(); 
var vm = new Vue({});

/********************************************************************************************
 * vue 객체에 Dataset Type 선언
 ********************************************************************************************/
Vue.prototype.ROWTYPE_EMPTY = 0;
Vue.prototype.ROWTYPE_NORMAL = 1;
Vue.prototype.ROWTYPE_INSERT = 2;
Vue.prototype.ROWTYPE_UPDATE = 4;
Vue.prototype.ROWTYPE_DELETE = 8;
Vue.prototype.ROWTYPE_GROUP = 16;


/********************************************************************************************
 * 푸시 수신 전역 변수 선언
 ********************************************************************************************/
Vue.prototype.pushAlarmCount = self == top ? {'mailCnt':0 ,'notyCnt':0 ,'msgCnt':0 } : parent.staticVue.pushAlarmCount;

/********************************************************************************************
 * vue 객체에 공통코드 선언
 ********************************************************************************************/
// 통합 공통코드 유동처리 wjjoo 2022.09.21
axios.get('/system-manager/service/codeUseList', {}).then(function (response) {
	var data = response.data;
	for(var i = 0 ; i < data.length ; i++){
		if(data[i].COMMCODE_USE_YN == 'Y'){
			Vue.prototype[data[i].SERVICE_CD.toLowerCase() + 'Commcode'] = self == top ? new CommcodeSet(data[i].SERVICE_CD.toUpperCase(), true) : parent.staticVue[data[i].SERVICE_CD.toLowerCase() + 'Commcode'];
		}
	}
});

/********************************************************************************************
 * vue 객체에 서비스코드 선언
 ********************************************************************************************/
Vue.prototype.serviceCode = self == top ? new CustomcodeSet('/system-manager/service/initList') : parent.staticVue.serviceCodeSet;

/********************************************************************************************
 * vue 객체에 global Param 변수 선언
 ********************************************************************************************/
Vue.prototype.vueGlobalParam = '';

/********************************************************************************************
 * vue 객체에 Loading Overlay 함수 선언
 ********************************************************************************************/
Vue.prototype.LoadingOverlay = function(pTarget, TfVal){
	try{
		$(pTarget).LoadingOverlay(TfVal ? "show" : "hide", TfVal);
	}catch(err){
		console.log('common LoadingOverlay() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * vue 객체에 mask 함수 선언
 ********************************************************************************************/
Vue.prototype.mask = function(pType, pVal){
	try{
		if(pType == 'email'){
			const len = pVal.split('@')[0].length - 3;
			
			return pVal.replace(new RegExp('.(?=.{0,' + len + '}@)', 'g'), '*');
		}else if(pType == 'tel*'){
			var x = pVal.replace(/\D/g, '').match(/(\d{3})(\d{4})(\d{4})/);
			
			return '(' + x[1] + ') ' + '****' + '-' + x[3];
		}else if(pType == 'tel'){
			var x = pVal.replace(/(^02.{0}|^01.{1}|[0-9]{3})([0-9]+)([0-9]{4})/,"$1-$2-$3");
			
			return x;
		}else if(pType == 'YYYY-MM-DD'){
			var returnVal = moment(pVal, 'YYYYMMDD').format(pType);
			
			if(returnVal == 'Invalid date') return '';	
			else return returnVal;
		}else if(pType == 'HH:mm'){
			var returnVal = moment(pVal, 'HH:mm').format(pType);
			
			if(returnVal == 'Invalid date') return '';	
			else return returnVal;
			return returnVal;
		}
		
	}catch(err){
		console.log('common mask() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * vue 객체에 filter 선언
 ********************************************************************************************/
Vue.filter('numberFormat', function (value) {
    if(!value) return ''
    if(typeof value == 'number') value = String(value);

    return value.toFixed(0).replace(/(\d)(?=(\d{3})+(?:\.\d+)?$)/g, "$1,");
    
//    return value.split('').reverse().reduce((acc, digit, i) => {
//        if (i > 0 && i % 3 === 0) acc.push(',')
//        return [...acc, digit]
//    }, []).reverse().join('')
})

/********************************************************************************************
 * vue 객체에 logout 함수 선언
 ********************************************************************************************/
Vue.prototype.logout = function(){
	try{
		var returnVal = axios.post('/logout');
		
		returnVal.then(function(response) {
			if(self == top){
				window.location.href = window.location.origin;
			}else{
				parent.window.location.href = window.location.origin;
			}
		}).catch(function(error) {
			console.error('error:', error);
		});	
	}catch(err){
		console.log('common logout() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * vue 객체에 Loading Overlay 함수 선언
 ********************************************************************************************/
Vue.prototype.vueFleUpload = function(pTarget, pUploadPath){
	try{
		var files = pTarget.files;
		var formData = new FormData();
		
		formData.append('upload_path', pUploadPath);
		for(var i=0 ; i < files.length ; i++){
			var index = i+1;
			formData.append('file'+index, files[i]);
		}
		
		return axios.post('/commons/file/file-upload',
			formData,
	        {
	            headers: {
	                'Content-Type': 'multipart/form-data'
	            },
	        }
	    ).catch(function(error) {
			console.error('error:', error);
			return false;
		});
	}catch(err){
		console.log('common vueFleUpload() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * 페이지 오픈
 ********************************************************************************************/
$(document).ready(function() {
	try{
		// 해시가 있다면 즉시 제거
		window.addEventListener('hashchange', function(event) {
			const urlWithoutHash = window.location.href.split('#')[0];

			if (window.location.hash.length > 0) {
				history.replaceState({'url': urlWithoutHash}, null, urlWithoutHash);
				popStateCheck = false;
			}
		});
		window.addEventListener('DOMContentLoaded', function() {
			if (window.location.hash.length > 0) {
				const urlWithoutHash = window.location.href.split('#')[0];
				history.replaceState({'url': urlWithoutHash}, null, urlWithoutHash);
				popStateCheck = false;
			}
		});

		if(typeof VeeValidate == 'function') Vue.use(VeeValidate,{locale: 'ko'});
		if(typeof VCalendar == 'object') Vue.use(VCalendar);
		if(typeof Vue2PerfectScrollbar == 'object') Vue.use(Vue2PerfectScrollbar);
		if(typeof VueToast == 'object') Vue.use(VueToast);
		//VueClipboard.config.autoSetContainer = true;
		//Vue.use(VueClipboard);
		if(typeof VueMask == 'object') Vue.directive('mask', VueMask.VueMaskDirective);
		if(typeof tui.Grid == 'function') tuiGridInit();
		
		document.addEventListener('keydown', function(event) {
			var noeExistsEl = ['TEXTAREA','DIV'];
			
			if(noeExistsEl.indexOf(event.target.tagName) == -1 && event.keyCode === 13){
				event.preventDefault();
			}
		}, true);
		
		globalSession = getSession();
		globalSession.then(function(response) {
			//header.html mounted 로 이동
			//staticVue.webSockConn(); 
		}).catch(function(error) {
			console.error('session info set ERROR:', error);
			return null;
		});
		
		globalDefaultInfo = getDefaultInfo();
		globalDefaultInfo.then(function(response) {
			if(self == top){
				document.title = response.data.SITE_NM;
				
				if(isPc() && !isChrome()){
					//notifySubmit('info', '알림', response.data.SITE_NM+'은 크롬(Chrome)에서 최적화되어있습니다. 크롬 사용을 권장합니다', 'icon-caution', 150000);
				}else if(isPc() && !isChrome() && !isIE11OrMore()){
					alert(response.data.SITE_NM+'은 크롬(Chrome) 및 IE11이상\n에서 사용가능합니다.\n크롬 다운로드 페이지로 이동합니다.');
					location.href= "https://www.google.com/intl/ko_ALL/chrome/";
				}
			}else{
				document.title = response.data.SITE_NM;
				parent.document.title = response.data.SITE_NM;
			}
			
			globalDefaultInfo = response.data;
		}).catch(function(error) {
			console.error('defaultInfo info set ERROR:', error);
			return null;
		});
		
		setLoadingOverlayDefaultSetting();
	}catch(err){
		console.log('common $(document).ready Error : '+err.message);
		return false;
	}
});

//vue 객체에 사용자 세션정보 선언
function getSession(){
	try{
		var returnVal = axios.get('/session-info');
		
		returnVal.then(function(response) {
			/* 1:총장 , 2:교원 , 3:직원,  4 : 학생 , 5 :대학원생*/
			/* 쿠키 추출*/

			var accessToken='';
			// console.log("확인용 로그 - AccessToken : " + accessToken);
			if(['1', '2', '3', '4', '5'].indexOf(response.data.USER_GB) > -1) {
				var cookie = document.cookie;
				var index = cookie.indexOf("access_token");
				/* access_token 존재하는지 */
				if(index > -1) accessToken = cookie.substring(13,cookie.length); /*13번째 행부터 문자열 끝까지 */
				/* 이미지 불러오기 호출 주소용 카테고리 */
				var cateGoryStr = '';

				if(response.data.USER_GB == '4') cateGoryStr = 'US_SCRG_BASS';
				else if(response.data.USER_GB == '5') cateGoryStr = 'GS_SCRG_BASS';
				else if(response.data.USER_GB == '1' || response.data.USER_GB == '2' || response.data.USER_GB == '3') cateGoryStr = 'AM_PESN_MST';

				/* 호스트네임에 따른 이미지 호출 주소 설정 */
				// if ('portal.hs.ac.kr' == location.hostname) response.data.USER_PIC = 'https://hsctis.hs.ac.kr/api/image/view/' + cateGoryStr + '/' + response.data.USER_ID + '?access_token=' + accessToken;
				// else if ('portal-dev.hs.ac.kr' == location.hostname) response.data.USER_PIC = 'https://hsctis.hs.ac.kr/api/open/image/view/' + cateGoryStr + '/' + response.data.USER_ID
				//response.data.USER_PIC = 'https://hsctis.hs.ac.kr/api/open/image/view/' + cateGoryStr + '/' + response.data.USER_ID
			}
			response.data.ACCESS_TOKEN = accessToken;

			Vue.prototype.session = response.data;
			Vue.prototype.session.OCR_HISTORY_RECODE_YN = 'Y';
		}).catch(function(error) {
			console.error('session info set ERROR:', error);
			return null;
		});
		
		return returnVal;
	}catch(err){
		console.log('common getSession() Error : '+err.message);
		return false;
	}
}

//vue 객체에 고객 기본정보 설정
function getDefaultInfo(){
	try{
		var returnVal = axios.get('/system-manager/default-info/representative');
		
		returnVal.then(function(response) {
			Vue.prototype.defaultInfo = response.data;
		}).catch(function(error) {
			console.error('session info set ERROR:', error);
			return null;
		});
		
		return returnVal;
	}catch(err){
		console.log('common getDefaultInfo() Error : '+err.message);
		return false;
	}
}

function setLoadingOverlayDefaultSetting(session){
	try{
		//var userGb = session.data.USER_GB;
		//var color = userGb == 3 || userGb == 5 || userGb == 9 ? '#8743ae' : userGb == 1 || userGb == 2 ? '#6954b8' : '#4873ca';
		
		$.LoadingOverlaySetup({
		    background      : "rgba(255, 255, 255, 0.0)",
		    image           : "/images/common/loading_spin_blue.svg",
//		    imageAnimation  : "1.5s fadein",
		    minSize			: 50,
		    maxSize			: 80,
//	 	    imageColor      : color,
		});
	}catch(err){
		console.log('common setLoadingOverlayDefaultSetting() Error : '+err.message);
		return false;
	}
}

//input file 이미지 미리보기
function getThumbnailPrivew(html, $target) {
	try{
	    if (html.files && html.files[0]) {
	        var reader = new FileReader();
	        reader.onload = function(e) {
	            $target.css('display', 'block');
	            $target.html('<img id="singleImg" src="' + e.target.result + '" border="0" alt="" />');
	        }
	        reader.readAsDataURL(html.files[0]);
	    }
	}catch(err){
		console.log('common getThumbnailPrivew() Error : '+err.message);
		return false;
	}
}

function modal_open(el) {
	try{
	    var temp = $('#' + el);
	
        temp.fadeIn();
	
	    if (temp.outerWidth() < $(document).width()) temp.css('margin-left', '-' + temp.outerWidth() / 2 + 'px');
	    else temp.css('left', '0px');
	
	    temp.find('a.cbtn, a.layer_close, .cbtn2').off('click');
	    temp.find('a.cbtn, a.layer_close, .cbtn2').click(function(e) {
	    	if($(this).parents('.modal-container').length <= 1){
	    		temp.fadeOut();
		        $("html").css("overflow", "auto");
		        $(this).parents('.modal-layer-wrap').eq(0).removeClass('on');
	            e.preventDefault();
	    	}
	    });
	    
	    $("html").css("overflow", "hidden");
	    temp.parents('.modal-layer-wrap').eq(0).find(temp).parent().addClass('on');
	    
	    
	    /*var temp = $('#' + el);
	    var bg = temp.prev().hasClass('bg'); 
	
	    if (bg) { 
	    	$('.layer').fadeIn();
	    } else {
	        temp.fadeIn();
	    }
	
	    if (temp.outerWidth() < $(document).width()) temp.css('margin-left', '-' + temp.outerWidth() / 2 + 'px');
	    else temp.css('left', '0px');
	
	    temp.find('a.cbtn, a.layer_close, .cbtn2').click(function(e) {
	        if (bg) {
	            $('.layer').fadeOut();
	        } else {
	            temp.fadeOut();
	            e.preventDefault();
	        }
	    });
	    
	    $('.layer .bg').click(function(e) {
	        $('.layer').fadeOut();
	        e.preventDefault();
	    });
	
	    $("html").css("overflow", "hidden");
	
	    temp.find('.cbtn, .layer_close, .cbtn2').fadeIn().click(function() {
	        $(this).fadeOut()
	        $("html").css("overflow", "auto");
	        $(this).parents('.modal-layer-wrap').eq(0).removeClass('on');
	    });
	
	    //modal background dark
	    temp.parents('.modal-layer-wrap').eq(0).find(temp).parent().addClass('on');*/
	    return true;
	}catch(err){
		console.log('common modal_open() Error : '+err.message);
		return false;
	}
}

function modal_close(el) {
	try{
		var temp = $('#'+el); //레이어의 id를 temp변수에 저장var temp = $('#'+el); //레이어의 id를 temp변수에 저장
		$("html").css("overflow", "auto");
	    temp.hide();
	    $('#' + el).parents('.modal-layer-wrap').eq(0).removeClass('on');
	    return true;
	}catch(err){
		console.log('common modal_close() Error : '+err.message);
		return false;
	}
}

function pad(n, width) {
	  n = n + '';
	  return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
}

function tuiGridInit() {
	tui.Grid.setLanguage('ko'); // set Korean
	tui.Grid.applyTheme('striped', {
   		outline: {
   			border: '#dcdff1',
   			showVerticalBorder: true,
   		},
   		area: {
   			header: {
   				background: '#4f5685',
   			}
   		},
   		row: {
   			even: {
   				background: '#f7f8fb',
   				text: '#555',
   			},
   			hover: {
   				background: '#e2e2e3',
   			}
   		},
   		cell: {
   			normal: {
   		      background: '#fff',
   		      border: '#dcdff1',
   		      text: '#555',
   		    },
   			header: {
   				background: '#4f5685',
   				border: '#9a9dac',
   				text: '#fff',
   				showVerticalBorder: true,
   			},
   			rowHeader: {
   				background: '#f9f9f9',
   				text: '#555',
   			},
   			selectedHeader: {
   				background: '#383d61',
   			},
   			normal: {
   				background: '#fff',
   				border: '#dcdff1',
   				text: '#555',
   				showVerticalBorder: true,
   			},
   			summary: {
   				background: '#eaecf1',
   				border: '#dcdff1',
   				text: '#555',
   				showVerticalBorder: true,
   				//showHorizontalBorder: false,
   			}
   		},
   		frozenBorder: {
   			border: '#eaecf1',
   		}
   	    /* grid: {
   	        border: '#aaa',
   	        text: '#333'
   	    },
   	    cell: {
   	        disabled: {
   	            text: '#999'
   	        }
   	    } */
   	});
}

function numberMaxLng(input, maxLength){	
	// 현재 커서 위치 저장
	const cursorStart = input.selectionStart;
	const cursorEnd = input.selectionEnd;
	const inputLength = input.value.length;

	// 입력 값 처리: 숫자만 허용
	let value = input.value.replace(/[^0-9]/g, ''); // 숫자 이외 제거
	let num = parseInt(value, 10);
	//자리수 확인
	if (!isNaN(num) && num.toString().length > maxLength) {
		num = input.value.slice(0, maxLength);
	}else if(isNaN(num)){
		num = '';
	}

	// 값 업데이트
	input.value = num.toString();

	// 커서 위치 복원
	const newLength = input.value.length;
	const cursorOffset = newLength - inputLength;
	input.setSelectionRange(
	  cursorStart + cursorOffset,
	  cursorEnd + cursorOffset
	);
}

//자재사용여부 검증1차(등록 시 자재유효성체크)
function getMtrlUseYn(params){
	return axios.get('/ami/mob/mtl/mobMtl1000/selectMtrlUseYn', {
	    params: params,
	    loading: false
	}).then(function(response) {
	    var data = response.data;
	    return data;
	}).catch(function(error) {
	    notifySubmit('error', '자재유효성검사', '문제가 발생했습니다.', 'icon-caution');
	    console.error("유효성검사 실패:", error);
	    return 'N';
	});
}

//자재상태값체크 검증2차(전송단계에 최종적으로 자재유효성체크 및 전송취소 시 전송취소가 가능한 상태인지 체크)
function getMtrlStsCheck(params){
	return axios.post('/ami/mob/mtl/mobMtl1000/selectMtrlStsCheck', {
		params: params,
		loading: true
	}).then(function(response) {
		let msg = "";
		//response.data는 컨트롤러에서 조건에 따라 값이 있거나 없거나(빈값인 경우 정상)
		if(response.data.length > 0){
			if(response.data[0].REVOKE === 'Y'){ //전송취소 시
				if(response.data[0].WRHSG_SHP_CL_CD !== '50'){
					//현장설치상태가 아니면 전송 및 전송취소 불가
					msg = `${response.data[0].FCTY_ID_GUBUN} ${response.data[0].FCTY_ID} ${response.data[0].MTRL_STS_NM}된 자재입니다.`;
					return  msg;
				}else if(response.data[0].SHP_PURP_CTT !== '1'){
					//전송취소이면서 출고목적이 시공이 아니면 전송취소 불가 
					msg = `AMI공사에서 출고된 자재가 아닙니다.`;
					return  msg;					
				}else if(response.data[0].WRHSG_SHP_CL_CD === '50'){
					msg = `${response.data[0].FCTY_ID_GUBUN} ${response.data[0].FCTY_ID}자재는 ${response.data[0].MTRL_USER_NM}에게 ${response.data[0].MTRL_STS_NM}된 자재입니다.`;
					return  msg;
				}
			}else{
				if(response.data[0].WRHSG_SHP_CL_CD !== '20'){
					//출고상태가 아니면 전송 및 전송취소 불가
					msg = `${response.data[0].FCTY_ID_GUBUN} ${response.data[0].FCTY_ID} ${response.data[0].MTRL_STS_NM}된 자재입니다.`;
					return  msg;
				}else if(response.data[0].WRHSG_SHP_CL_CD === '20'){
					if(response.data[0].MTRL_USER_ID !== response.data[0].SYSTEM_ID){
						msg = `${response.data[0].FCTY_ID_GUBUN} ${response.data[0].FCTY_ID}자재는 ${response.data[0].MTRL_USER_NM}에게 ${response.data[0].MTRL_STS_NM}된 자재입니다.`;
					}else if(response.data[0].MTRL_LST_APR_STS_CD === '10' && !isNull(response.data[0].MTRL_LST_APR_STS_CD)){
						msg = `${response.data[0].FCTY_ID_GUBUN} ${response.data[0].FCTY_ID}자재는 승인요청된 자재입니다.`;
					}
					return  msg;
				}				
			}
		}else{
			return msg;
		}
	}).catch(function(error) {
	    notifySubmit('error', '자재상태값검사', '문제가 발생했습니다.', 'icon-caution');
	    console.error("자재상태값검사 실패:", error);
		return [];
	});
}

//마스터자재에 존재 여부 체크
function getMtrExstYn(params){
	return axios.get('/ami/mob/mtl/mobMtl1000/selectMtrExstYn', {
		params: params,
		loading: true
	}).then(function(response) {
	    return response.data;
	}).catch(function(error) {
	    notifySubmit('error', '철거가능한 자재 체크', '문제가 발생했습니다.', 'icon-caution');
	    console.error("철거가능한 자재 체크 실패:", error);
		return [];
	});
}

//td 클래스 색
Vue.prototype.getClassColor = function(cd) {
	// cd : OBS002
	if(cd === '20'){ //미조치
		return 'red';
	}else if(cd === '25'){ //임시저장
		return 'yellow';
	}else if(cd === '28'){ //완료
		return 'green';
	}else if(cd === '29'){ //블루
		return 'blue';
	}else{
		return '';
	}
}

Vue.prototype.$onEnter = function (e) {
	e.preventDefault()
  	e.target.blur()
}