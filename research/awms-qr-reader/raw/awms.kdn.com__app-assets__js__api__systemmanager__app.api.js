function AppApi(){}
var appApi = new AppApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 앱 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
AppApi.prototype.app = function(pParams, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/system-manager/app', 
	{
		//post는 data사용 
		params: eval(pParams),
    	loading: loadingYn
    });
};

/********************************************************************************************
 * 앱 조회 
 * @param: 검색구분, 검색어
 * @return: 앱 정보
 ********************************************************************************************/
AppApi.prototype.appId = function(pAppId, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/system-manager/app/'+pAppId, 
	{
		//post는 data사용 
    	loading: loadingYn
    });
};

/********************************************************************************************
 * 앱  추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AppApi.prototype.appInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/app', entry);
};

/********************************************************************************************
 * 앱  수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AppApi.prototype.appUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/app', entry);
};

/********************************************************************************************
 * 앱  삭제
 * @param: 앱 순번
 * @return: 처리건수
 ********************************************************************************************/
AppApi.prototype.appDelete = function(pAppSeq, pLoading){
	var appSeq = pAppSeq;
	var loadingYn = pLoading;
	
	if(isNull(appSeq)) appSeq = '';
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.delete('/system-manager/app/'+appSeq);
};
