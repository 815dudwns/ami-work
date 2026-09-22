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
 * REST API 주소의 마지막 정보를 리턴한다.
 ********************************************************************************************/
function getApiLastParam(url){
	try{
		if(!url) url = window.location.href;
		return url.substring(url.lastIndexOf("/")+1);
	}catch(err){
		console.log('getApiLastParam() Error : '+err.message);
	} 
}

/********************************************************************************************
 * YJAHN
 * REST API 주소를 '/' 기준으로 쪼개어 해당하는 위치의 정보를 리턴한다.
 * ex) getRestApiUrlParam(http://localhost:8080/url1/url2/url3, 3) -> url1
 ********************************************************************************************/
function getRestApiUrlParam(url, position){
	try{
		if(!url)		url 	 = window.location.href;
		if(!position) 	position = 1;
		return url.replaceAll("#", "").split("/")[position];
	}catch(err){
		console.log('getRestApiUrlParam() Error : '+err.message);
	} 
}

/********************************************************************************************
 * 넘겨받은 인자값이 빈값(null, '', undefined 등)인지 아닌지를 판단하여 boolean값으로 리턴한다.
 ********************************************************************************************/
function isNull(value){
	try{
		if(typeof value === "undefined" || typeof value === null || typeof value === "" || (typeof value === 'string' && value.length === 0) || ''+value+'' === 'null' || (typeof value === 'string' && value.indexOf("undefined") > -1)){
			//console.log('"'+value+'" is null => ' + typeof value);
			return true;
		}else{
			//console.log('"'+value+'" is not null => ' + typeof value);
			return false; 
		}
	}catch(err){
		console.log('isNull() Error : '+err.message);
	}
}

/********************************************************************************************
 * 넘겨받은 인자값이 빈값(null, '', undefined 등)이면 ''로 리턴, 아닐경우 원래값을 리턴한다.
 ********************************************************************************************/
function nullToEmpty(value){
	try{
		if(typeof value === "undefined" || typeof value === null || typeof value === "" || (typeof value === 'string' && value.length === 0) || ''+value+'' === 'null' || (typeof value === 'string' && value.indexOf("undefined") > -1)){
//			console.log('"'+value+'" is null => ' + typeof value);
			return '';
		}else{
//			console.log('"'+value+'" is not null => ' + typeof value);
			return value; 
		}
	}catch(err){
		console.log('nullToEmpty() Error : '+err.message);
	}
}

/********************************************************************************************
 * replaceAll
 ********************************************************************************************/
String.prototype.replaceAll = function(target, replacement) {
	return this.split(target).join(replacement);
};

/********************************************************************************************
 * 배열의 key name을 재정의한다.
 ********************************************************************************************/
_.rename = function (objArray, key, newKey) {
	try{
		_.forEach(objArray, function(obj, k){
			if(_.includes(_.keys(obj), key)) {
				obj[newKey] = _.clone(obj[key], true)
				delete obj[key]
			}
		});
		return objArray;
	}catch(err){
		console.log('rename() Error : '+err.message);
	}
}

/********************************************************************************************
 * 전화번호를 파라메터로 받아 type에 따라 첫, 둘째, 셋째 그룹값을 반환한다.
 ********************************************************************************************/
var telformat = function(tel, type) {    
    var result = '';
    var target = tel.replace(/-/g, '');
    var len    = target.length;

    if (len < 8) {
        result = '';
    } else {
        if (type == '1') {
            if (len == 9 || len == 10) {
                result = target.substring(0, 2) == '02' ? '02':target.substring(0, 3);
            } else {
                result = len == 11 ? target.substring(0, 3):target.substring(0, 4);
            }
        }
        if (type == '2') {
            if (len == 9 || len == 10) {
                result = target.substring(0, 2) == '02' ? target.substring(2, 6):target.substring(3, 7);
            } else {
                result = len == 11 ? target.substring(3, 7):target.substring(4, 8);
            }
        }
        if (type == '3') {
            result = len < 9 ? '':target.substring(len - 4, len);
        }
    }

    return result;
}

/********************************************************************************************
 * 전화번호를 받아 하이픈 적용하여 리턴한다.
 ********************************************************************************************/
var telnoformat = function(target) {
	if(isNull(target)) return target;
    var result = '';
    var tel1   = telformat(target, 1);
    var tel2   = telformat(target, 2);
    var tel3   = telformat(target, 3);

    if (tel1 == '') {
        result = '';
    } else if (tel2 == '') {
        result = tel1;
    } else if (tel3 == '') {
        result = tel1 + '-' + tel2;
    } else {
        result = tel1 + '-' + tel2 + '-' + tel3;
    }

    return result;
}


/********************************************************************************************
 * 디바이스 종류를 구분하여 PC여부를 리턴한다.
 ********************************************************************************************/
function isPc() {
    // 디바이스 종류 설정
    var pc_device = "win16|win32|win64|mac|macintel";
    // 접속한 디바이스 환경
    var this_device = navigator.platform;
    if(this_device) {
        if(pc_device.indexOf(navigator.platform.toLowerCase()) < 0) {
        	return false;
        } else {
            return true;
        }
    }
}

/********************************************************************************************
 * 브라우저가 크롬인지 확인하여 리턴한다.
 ********************************************************************************************/
function isChrome(){
	//includes는 IE에서 동작하지 않아서 indexOf를 사용
	var userAgent = window.navigator.userAgent;
	var isChrome = userAgent.indexOf('Chrome');
	var isChromeMobile = userAgent.indexOf('CriOS');
	var isSamsungBrowser = userAgent.indexOf('SamsungBrowser');
	var isWindows = userAgent.indexOf('Windows NT');
	var isEdge = userAgent.indexOf('Edge');
	var isIE = userAgent.indexOf('Trident');

	// 크롬 브라우저 체크
	if(isChrome > -1 || isChromeMobile > -1){
	    if(isSamsungBrowser < 0 && isEdge < 0){
	        return true;
	    }else{
	    	return false;
	    }
	}else{
		return false;
	}
}

/********************************************************************************************
 * IE 11보다 버전이 낮은지 확인
 ********************************************************************************************/
function isIE11OrMore(){
	var UA = navigator.userAgent.toLowerCase();
	
	if (UA.indexOf('msie') != -1 || UA.indexOf('trident') != -1) {
		var version = 11;
		
		UA = /msie ([0-9]{1,}[\.0-9]{0,})/.exec(UA);
		if(UA) { 
			version = parseInt(UA[1]); 
		}
		
		if(version < 11){
			return false;
		}else{
			return true;
		}
	}else{
		return true;
	}	
}

/********************************************************************************************
 * Toast 메시지 Show
 ********************************************************************************************/
function notifySubmit(color, title, message, icon, duration){
	//color: success, info, warning, danger
	//type: success, error, warning, info, default
	var type = 'default';
	var durationVal = 3000;
	
	if(!isNull(duration)) durationVal = duration;
	if(color == 'success') type = 'success';
	else if(color == 'info') type = 'info';
	else if(color == 'warning') type = 'warning';
	else if(color == 'danger' || color == 'error') type = 'error';
	
	if(self == top){

		Vue.$toast.open({
		    message: message,
		    type: color,
		    position: isPc() ? 'bottom-right' : 'top',
		    duration: durationVal,
		    // all other options
		});
	}else{
		parent.notifySubmit(color, title, message, icon)
	}
}

/********************************************************************************************
 * String to JSON(Object) 변환
 ********************************************************************************************/
function stringtoObject(s){
	// preserve newlines, etc - use valid JSON
	s = s.replace(/\\n/g, "\\n")  
         .replace(/\\'/g, "\\'")
         .replace(/\\"/g, '\\"')
         .replace(/\\&/g, "\\&")
         .replace(/\\r/g, "\\r")
         .replace(/\\t/g, "\\t")
         .replace(/\\b/g, "\\b")
         .replace(/\\f/g, "\\f");
	// remove non-printable and other non-valid JSON chars
	s = s.replace(/[\u0000-\u0019]+/g,""); 
	var o = JSON.parse(s);
	return o;
}

/********************************************************************************************
 * string String::cut(int len)
 * 글자를 앞에서부터 원하는 바이트만큼 잘라 리턴합니다.
 * 한글의 경우 2바이트로 계산하며, 글자 중간에서 잘리지 않습니다.
 ********************************************************************************************/
String.prototype.cut = function(len) {
	var str = this;
	var l = 0;
	
	for (var i=0; i<str.length; i++) {
	    l += (str.charCodeAt(i) > 128) ? 2 : 1;
	    if (l > len) return str.substring(0,i)/* + "..."*/;
	}
	return str;
}
 
 
/********************************************************************************************
 * bool String::bytes(void)
 * 해당스트링의 바이트단위 길이를 리턴합니다. (기존의 length 속성은 2바이트 문자를 한글자로 간주합니다)
 ********************************************************************************************/
String.prototype.bytes = function() {
	var str = this;
	var l = 0;
	for (var i=0; i<str.length; i++) l += (str.charCodeAt(i) > 128) ? 2 : 1;
	return l;
}



/********************************************************************************************
 * 문자열(str)에서 특정태그(node)의 특정속성(src)를 추출하여 배열형태로 리턴한다.
 ********************************************************************************************/
function getAttrFromString(str, node, attr) {
    var regex = new RegExp('<' + node + ' .*?' + attr + '="(.*?)"', "gi"), result, res = [];
    while ((result = regex.exec(str))) {
        res.push(result[1]);
    }
    return res;
}