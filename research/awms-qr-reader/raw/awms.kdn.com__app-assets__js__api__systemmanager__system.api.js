function SystemApi(){}
var systemApi = new SystemApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 알람 정보 갱신 
 * @param: null
 * @return: null
 ********************************************************************************************/
SystemApi.prototype.alarmRefresh = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/daemon/alarm');
}

/********************************************************************************************
 * 권한 정보 갱신 
 * @param: null
 * @return: null
 ********************************************************************************************/
SystemApi.prototype.authRefresh = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/daemon/auth');
}

/********************************************************************************************
 * 기본정보 갱신 
 * @param: null
 * @return: null
 ********************************************************************************************/
SystemApi.prototype.defaultinfoRefresh = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/daemon/defaultinfo');
}

/********************************************************************************************
 * 서비스 정보 갱신 
 * @param: null
 * @return: null
 ********************************************************************************************/
SystemApi.prototype.serviceRefresh = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/daemon/service');
}

/********************************************************************************************
 * 크로스도메인 주소호출(리턴 타입xml) 
 * @param: null
 * @return: null
 ********************************************************************************************/
SystemApi.prototype.corsXml = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/commons/cors/xml', pParam);
}

/********************************************************************************************
 * 크로스도메인 주소호출(리턴 타입json)
 * @param: null
 * @return: null
 ********************************************************************************************/
SystemApi.prototype.corsJson = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.post('/commons/cors/json', pParam);
}

/********************************************************************************************
 * 개인정보 관련 메뉴 호출 로그 저장 
 * @param: 메뉴정보, 개인정보 내역
 * @return: 
 ********************************************************************************************/
SystemApi.prototype.setSystemLog = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/commons/log/personal-information', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 개인정보 관련 메뉴 호출 로그 저장 
 * @param: 메뉴정보, 개인정보 내역
 * @return: 
 ********************************************************************************************/
SystemApi.prototype.setMenuLog = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/commons/log/menu', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}