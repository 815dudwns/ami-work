function LoglistApi(){}
var loglistApi = new LoglistApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 로그 목록 조회 
 * @param: 검색구분, 검색어, 알림 상세 구분 코드
 * @return: 조회 리스트
 ********************************************************************************************/
LoglistApi.prototype.getLogList = function(pEntry, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) 		loadingYn 		= false;
    
    return axios.get("/system-manager/log/log-list",
	{
		//post는 data사용 
		params: pEntry,
    	loading: loadingYn
    });
};

/********************************************************************************************
 * 로그 통계 조회 
 * @param: 통계 종류, 조회 기간
 * @return: 조회 리스트
 ********************************************************************************************/
LoglistApi.prototype.getLogTonggye = function(pEntry, pLoading){
    var entry	  = pEntry;
    var loadingYn = pLoading;
    
    if(isNull(entry)) 		entry		= {};
	if(isNull(loadingYn)) 	loadingYn 	= false;
    
    return axios.get("/system-manager/log/log-statistics",
	{
		//post는 data사용 
		params: {
			pLogTonggyeGb	: entry.pLogTonggyeGb,
			pCd1			: entry.pCd1,
			pYear			: entry.pYear,
			pLogFrDt		: entry.pLogFrDt,
			pLogToDt		: entry.pLogToDt 
    	},
    	loading: loadingYn
    });
};

/********************************************************************************************
 * 접속자 수 조회 
 * @param: 통계 종류, 조회 기간
 * @return: 조회 리스트
 ********************************************************************************************/
LoglistApi.prototype.getUsersLogList = function(pEntry, pLoading){
    var entry	  = pEntry;
    var loadingYn = pLoading;
    
    if(isNull(entry)) 		entry		= {};
	if(isNull(loadingYn)) 	loadingYn 	= false;
    
    return axios.get("/system-manager/log/jeopsokja",
	{
		//post는 data사용 
		params: entry,
    	loading: loadingYn
    });
};


/********************************************************************************************
 * 게시판 이용자 조회 
 * @param: 통계 종류, 조회 기간
 * @return: 조회 리스트
 ********************************************************************************************/
LoglistApi.prototype.getBoardsLogList = function(pEntry, pLoading){
    var entry	  = pEntry;
    var loadingYn = pLoading;
    
    if(isNull(entry)) 		entry		= {};
	if(isNull(loadingYn)) 	loadingYn 	= false;
    
    return axios.get("/system-manager/log/boards",
	{
		//post는 data사용 
		params: entry,
    	loading: loadingYn
    });
};

