function DefaultinfoApi(){}
var defaultinfoApi = new DefaultinfoApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 기본정보관리 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
DefaultinfoApi.prototype.service = function(pSearchType, pSearchArgv, pPageNo, pRowCnt, pLoading){
	var searchType = pSearchType;
	var searchArgv = pSearchArgv;
	var pageNo = pPageNo;
	var rowCnt = pRowCnt;
	var loadingYn = pLoading;
	
	if(isNull(searchArgv)) searchArgv = '';
	if(isNull(searchType)){
		searchType = '';
		searchArgv = '';
	}
	if(isNull(pageNo)) pageNo = 1;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/system-manager/default-info', 
	{
		//post는 data사용 
		params: {
			pSearchType: searchType,
			pSearchArgv: searchArgv,
			pPageNo: pageNo,
			pRowCnt : rowCnt
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 알림 대상 리스트 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
DefaultinfoApi.prototype.representative= function(pSiteSeq, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/system-manager/default-info/representative', 
	{
		//post는 data사용 
		params: {
			pSiteSeq : pSiteSeq,
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 기본정보관리 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
DefaultinfoApi.prototype.defaultinfoInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/default-info', entry);
}

/********************************************************************************************
 * 기본정보관리 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
DefaultinfoApi.prototype.defaultinfoUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/default-info', entry);
}

/********************************************************************************************
 * 기본정보관리  삭제
 * @param: 사이트 순번
 * @return: 처리건수
 ********************************************************************************************/
DefaultinfoApi.prototype.defaultinfoDelete = function(pSiteSeq, pLoading){
	var siteSeq = pSiteSeq;
	var loadingYn = pLoading;
	
	if(isNull(siteSeq)) siteSeq = '';
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.delete('/system-manager/default-info/'+pSiteSeq);
}