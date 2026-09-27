function AppApiApi(){}
var appApiApi = new AppApiApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 앱 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
AppApiApi.prototype.app = function(pSearchType, pSearchArgv, pPageNo, pRowCount, pLoading){
	var searchType = pSearchType;
	var searchArgv = pSearchArgv;
	var pageNo = pPageNo;
	var rowCount = pRowCount;
	var loadingYn = pLoading;
	
	if(isNull(searchArgv)) searchArgv = '';
	if(isNull(searchType)){
		searchType = '';
		searchArgv = '';
	}
	//if(isNull(pageNo)) pageNo = 1;            //pageNo가 null인 경우 페이징 하지 않음   
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/api/system-manager/app', 
	{
		//post는 data사용 
		params: {
			pSearchType: searchType,
			pSearchArgv: searchArgv,
			pPageNo: pageNo,
			pRowCount: rowCount
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 앱 조회 
 * @param: 검색구분, 검색어
 * @return: 앱 정보
 ********************************************************************************************/
AppApiApi.prototype.appId = function(pAppId, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/api/system-manager/app/'+pAppId, 
	{
		//post는 data사용 
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 내가 구독 중인 전체 앱 조회
 * @param: 
 * @return: 처리건수
 ********************************************************************************************/
AppApiApi.prototype.subscribeApps = function(){
	return axios.get('/api/system-manager/app/subscribe-apps');
}