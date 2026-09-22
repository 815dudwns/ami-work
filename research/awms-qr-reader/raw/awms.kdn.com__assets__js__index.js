/********************************************************************************************
 * 페이지 로드시 수행
 ********************************************************************************************/
var globalProtocol = window.location.protocol;
var globalHost = window.location.host;
var globalPathname = window.location.pathname;
var globalPushStateUrl = globalProtocol + "//" + globalHost + globalPathname;
var globalCurrentUrl = '';
var globalAppId = '';
var globalAppEndpoint = '';
var globalAppNm = '';
var globalAppIcon = '';
var globalAppColor = '';
var globalPostNo = getParameterByName('postNo', window.location);
var popStateCheck = false;

$(document).ready(function() {
	try{
		var agent = window.navigator.userAgent.toLowerCase();

		if(agent.indexOf('firefox')>-1){
			setTimeout(function() {
				indexInit();
			},500);
		}
		else{
			indexInit();
		}
	}catch(err){
		console.log('index.js $(document).ready Error : '+err.message);
		return false;
	}
});

/********************************************************************************************
 * 초기화 함수
 ********************************************************************************************/
function indexInit(){
	try{
		var urlInfo = window.location;
		var portalPage = getParameterByName('portalPage', urlInfo);
		var serviceCd = getParameterByName('service', urlInfo);
		var appId = getParameterByName('app', urlInfo);
		var menu = getParameterByName('menu', urlInfo);
		var param = getParameterByName('param', urlInfo);

		openHeader();
		openFooter();

		if(!isNull(portalPage)){
			portalOpen(portalPage);
		}else if(isNull(appId)){
			portalOpen();
		}else{
			appHtmlOpen();
			appOpen(appId, menu, param, true);
		}
	}catch(err){
		console.log('index.js indexInit() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * 포털(app이 아닌)메뉴 오픈 시 사용되는 함수 /html/sub/하위의 html페이지 명을(확장자 포함) 인자로 받는다.
 ********************************************************************************************/
function portalOpen(pPageName){
	try{
		var pageName = 'portal_main';

		if(!isNull(pPageName)){
			pageName = pPageName;
		}

		$.ajax({
			url: '../sub/'+pageName+'.html',
			type: 'HEAD',
			async: false,
			success: function () {
				$.get('../sub/'+pageName+'.html', function(response){
					$('#content_wrap #app_article').hide();
					var url = globalPushStateUrl+"?portalPage="+pageName;

					if(self == top) $("html").css("overflow", "auto");
					else $("html",document.parent).css("overflow", "auto");
					initAppInfo();
					$('#content_wrap').css('height','auto');
					$('#content_wrap #portal_article').html(response);
					if(!popStateCheck)
						setPushSate('parent', {'url':url}, null, url);

					$('#content_wrap #portal_article').show();
					popStateCheck = false;
				});

				appHtmlOpen();
			},
			error : function(request, status, error ) {
				location.reload();
			},
		});
	}catch(err){
		console.log('index.js portalOpen() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * 포털(app이 아닌)메뉴 오픈 시 사용되는 함수 /html/sub/하위의 html페이지 명을(확장자 포함) 인자로 받는다.
 ********************************************************************************************/
function appHtmlOpen(){
	try{
		$.ajax({
			url: '../sub/app_main.html',
			type: 'HEAD',
			async: false,
			success: function () {
				$.get('../sub/app_main.html', function(response){
					$('#content_wrap #app_article').html(response);
				});
			},
			error : function(request, status, error ) {
				location.reload();
			},
		});
	}catch(err){
		console.log('index.js appHtmlOpen() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * 포털 앱 오픈 시 사용되는 함수 /app/appNm/html/sub/하위의 html페이지 명을(확장자 포함) 인자로 받는다.
 ********************************************************************************************/
function appOpen(pAppId, pMenuCd, pParam, pTarget){
	try{
		var iframePage = '/html/error/appNotFound.html';
		var $iframe = '';
		var url = null;
		var appId = isNull(pAppId) ? '?app=' : '?app='+pAppId;
		var menu = isNull(pMenuCd) ? '&menu=' : '&menu='+pMenuCd;
		var urlParams = getUrlVars(window.location.href);

		if(!isNull(pParam)){
			self == top ? staticVue.vueGlobalParam = _.merge(pParam, urlParams) : parent.staticVue.vueGlobalParam = _.merge(pParam, urlParams);
		}else if(typeof urlParams == 'object' && _.size(urlParams)){
			self == top ? staticVue.vueGlobalParam = urlParams : parent.staticVue.vueGlobalParam = urlParams;
		}else{
			self == top ? staticVue.vueGlobalParam = '' : parent.staticVue.vueGlobalParam = '';
		}

		if(!isNull(pAppId)){
			if(!isNull(vm) && pTarget != '_blank') {
				// destroy the vue listeners, etc
				vm.$destroy();
			}

			var returnVal = appApiApi.appId(pAppId, false);

			if ($('#header .btn_app').text() == '닫기') {
				menuBtnClick(); //index.js
			}

			returnVal.then(function(response) {
				var appInfoObj = response.data;
				var beforeEndpoint = globalAppEndpoint;


				if(!isNull(appInfoObj)){

					if(pTarget == '_blank'){
						var win = '';
						/*2020.10.29 from accessing a cross-origin frame error 으로 인한 수정*/
						if(self == top) win = window.open(globalPushStateUrl + appId + menu, '_blank');
						else win = parent.window.open(globalPushStateUrl + appId + menu, '_blank');

//						if(self == top) win = window.postMessage(globalPushStateUrl + appId + menu, '_blank');
//						else win = parent.window.postMessage(globalPushStateUrl + appId + menu, '_blank');
					}else{
						setAppInfo(appInfoObj);
						iframePage = globalAppEndpoint + appId + menu;
						var parentUrl = globalPushStateUrl + appId + menu;
						var endpointProtocol = globalAppEndpoint.split("/")[0];
						globalCurrentUrl = parentUrl;

						//ENDPOINT가 같은 앱인 경우 script파일들을 재로드 하지 않기 위해서 메뉴와, 앱정보만 변경한다.
						if(iframePage.indexOf('/app-html/index.html') > -1 || (beforeEndpoint == globalAppEndpoint && (globalAppEndpoint.indexOf(globalHost) > -1 || globalAppEndpoint.indexOf('/') == 0))){
							$('#content_wrap #portal_article').hide();
							$('#content_wrap #app_article').show();

							$("#app_article",document.parent).css("overflow", "auto");

							if((!isNull(pParam) && pParam.isPush != true) || isNull(pParam)){
								// alert('감지테스트')
								setPushSate('parent', {'url':parentUrl}, null, parentUrl);
							}
							if(typeof changeAppInfo == 'function'){
								changeAppInfo();
							}
							if(typeof openLeft == 'function'){
								openLeft();
							}
						}
						//protocol이 상이하면 새창으로 open한다.
						else if(!isNull(endpointProtocol) && globalProtocol != endpointProtocol){
							/*2020.10.29 from accessing a cross-origin frame error 으로 인한 수정*/
							if(self == top) win = window.open(globalAppEndpoint, '_blank');
							else win = parent.window.open(globalAppEndpoint, '_blank');
z
//							if(self == top) win = window.postMessage(globalAppEndpoint, '_blank');
//							else win = parent.window.postMessage(globalAppEndpoint, '_blank');
						}
						else{
							if(self == top){
								$("#app_article").css("overflow", "auto");
								$("#app_article").scrollTop(0);
							}
							else{
								$("#app_article",document.parent).css("overflow", "auto");
								$("#app_article",document.parent).scrollTop(0);
							}

							$('#content_wrap #app_article').hide();
							$iframe = $('<iframe id="content" src="'+iframePage+'" name="content" width="100%" height="100%" frameborder="0" scrolling="yes" allowfullscreen></iframe>');
							$('#content_wrap #portal_article').empty();
							$iframe.appendTo('#content_wrap #portal_article');
							$('#content_wrap #portal_article').show();
							$('#content_wrap').css('height','100%');

						}
					}
				}else{
					console.log('앱 정보를 찾을 수 없습니다.');
				}
			}).catch(function(error) {
				console.error('error:', error);
			});
		}else{
			portalOpen();
		}
	}catch(err){
		console.log('index.js appOpen() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * 포털 내 외부링크 연결시 사용되는 함수
 ********************************************************************************************/
function linkOpen(pUrl, pTarget){
	try{
		var currentProtocol = window.location.protocol;
		var targetProtocol = pUrl.split("/")[0];

		if((!isNull(targetProtocol) && currentProtocol != targetProtocol) || pTarget == '_blank'){
			if(self == top) win = window.open(pUrl, '_blank');
			else win = parent.window.open(pUrl, '_blank');
		}else{
			$('#content_wrap #app_article').hide();
			$iframe = $('<iframe id="content" src="'+pUrl+'" name="content" width="100%" height="100%" frameborder="0" scrolling="yes" allowfullscreen></iframe>');
			$('#content_wrap #portal_article').empty();
			$iframe.appendTo('#content_wrap #portal_article');
			$('#content_wrap #portal_article').show();
		}
	}catch(err){
		console.log('index.js linkOpen() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * 포털의 header 부분을 오픈한다.(우측 메뉴 바 등)
 ********************************************************************************************/
function openHeader(){
	try{
		$.get('../include/header.html',function(response){
			$('#header').html(response);
		});
	}catch(err){
		console.log('index.js openHeader() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * 포털의 footer 부분을 오픈한다.
 ********************************************************************************************/
function openFooter(){
	try{
		$.get('../include/footer.html',function(response){
			$('#footer').html(response);
		});
	}catch(err){
		console.log('index.js openFooter() Error : '+err.message);
		return false;
	}

}

/********************************************************************************************
 * 포털 우측바의 메인 중앙 버튼 클릭
 ********************************************************************************************/
function menuBtnClick(){
	try{
		$('#header .btn_app').click();
	}catch(err){
		console.log('index.js menuBtnClick() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * 포털 우측바의 사용자 버튼 클릭
 ********************************************************************************************/
function userBtnClick(){
	try{
		$('#header .btn_user').click();
	}catch(err){
		console.log('index.js userBtnClick() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * 포털 우측바의 제일 하단 셋팅버튼 클릭
 ********************************************************************************************/
function setBtnClick(){
	try{
		$('#header .btn_set').click();
	}catch(err){
		console.log('index.js setBtnClick() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * 전역으로 선언되어있던 앱 정보 초기화
 ********************************************************************************************/
function initAppInfo(){
	try{
		globalAppId = '';
		globalAppEndpoint = '';
		globalAppNm = '';
		globalAppIcon = '';
		globalAppColor = '';
	}catch(err){
		console.log('index.js initAppInfo() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * 전역으로 선언되어있던 앱 정보 셋팅
 ********************************************************************************************/
function setAppInfo(appInfoObj){
	try{
		globalAppId = appInfoObj.APP_ID;
		globalAppEndpoint = appInfoObj.ENDPOINT;
		globalAppNm = appInfoObj.APP_NM;
		globalAppIcon = appInfoObj.ICON;
		globalAppColor = appInfoObj.COLOR;
	}catch(err){
		console.log('index.js setAppInfo() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * pushSate 셋팅
 ********************************************************************************************/
function setPushSate(target, state, title, url){
	try{
		if(target == 'parent'){
			window.history.pushState(state, title, url);
		}else if(target == 'child'){
			content.window.history.pushState(state, title, url);
		}
	}catch(err){
		console.log('index.js setAppInfo() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * URL에서 파라메터를 가져와서 해당 이름으로 된 파라메터의 값을 리턴 한다.
 ********************************************************************************************/
function getParameterByName(name, url){
	try{
		if(!url) url = window.location.href;
		name = name.replace(/[\[\]]/g, "\\$&");
		var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)");
		var results = regex.exec(url);
		if(results != null) return results[2];
		else return null;
	}catch(err){
		console.log('getParameterByName() Error : '+err.message);
	}
}


/********************************************************************************************
 * URL에서 파라메터를 가져와서 해당 이름으로 된 파라메터를 JSON으로 구성해서 return
 ********************************************************************************************/
function getUrlVars(url) {
	var hash;
	var myJson = {};
	var hashes = url.slice(url.indexOf('?') + 1).split('&');
	for (var i = 0; i < hashes.length; i++) {
		hash = hashes[i].split('=');
		if(hash[0] != 'app' && hash[0] != 'menu'){
			myJson[hash[0]] = hash[1];
		}
		// If you want to get in native datatypes
		// myJson[hash[0]] = JSON.parse(hash[1]);
	}
	return myJson;
}
