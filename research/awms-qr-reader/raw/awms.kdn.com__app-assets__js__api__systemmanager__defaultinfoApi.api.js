function DefaultinfoApiApi(){}
var defaultinfoApiApi = new DefaultinfoApiApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 이용약관
 ********************************************************************************************/
DefaultinfoApiApi.prototype.defaultinfo = function(){	
	return axios.get('/api/system-manager/default-info/defaultinfo');
}

/********************************************************************************************
 * 기본정보조회
 ********************************************************************************************/
DefaultinfoApiApi.prototype.info = function(params,loadingYn){	
	return axios.get('/api/system-manager/default-info/info',{
		params: eval(params),
    	loading: loadingYn
    });
}