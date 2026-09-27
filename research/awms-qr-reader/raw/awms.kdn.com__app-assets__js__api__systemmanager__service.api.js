function ServiceApi(){}
var serviceApi = new ServiceApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 서비스 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
ServiceApi.prototype.service = function(pSearchType, pSearchArgv, pPageNo, pRowCount, pLoading){
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
//	if(isNull(pageNo)) pageNo = 1;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/system-manager/service', 
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
 * 서비스 리스트 조회(시스템 조회) 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
ServiceApi.prototype.serviceInitList = function(pServiceCd, pServiceNm, pCommcodeUseYn, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/system-manager/service/initList', 
	{
		//post는 data사용 
		params: {
			pServiceCd: pServiceCd,
			pServiceNm: pServiceNm,
			pCommcodeUseYn: pCommcodeUseYn,
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 서비스  추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
ServiceApi.prototype.serviceInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/service', entry);
}

/********************************************************************************************
 * 서비스  수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
ServiceApi.prototype.serviceUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/service', entry);
}

/********************************************************************************************
 * 서비스  삭제
 * @param: 서비스코드
 * @return: 처리건수
 ********************************************************************************************/
ServiceApi.prototype.serviceDelete = function(pServiceCd, pLoading){
	var serviceCd = pServiceCd;
	var loadingYn = pLoading;
	
	if(isNull(serviceCd)) serviceCd = '';
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.delete('/system-manager/service/'+pServiceCd);
}
