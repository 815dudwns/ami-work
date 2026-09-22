function RestApiApi(){}
var restApiApi = new RestApiApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * REST API 조회 
 * @param: 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
RestApiApi.prototype.restApi = function(pSearchArgv, pPageNo, pRowCount, pLoading){
	var searchArgv = pSearchArgv;
    var pageNo = pPageNo;
    var rowCount = pRowCount;
	var loadingYn = pLoading;
	
	if(isNull(searchArgv)) searchArgv = '';
    if(isNull(pageNo)) pageNo = 1;
    if(isNull(rowCount)) rowCount = 5;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/system-manager/rest-api', 
	{
		//post는 data사용 
		params: {
			pSearchArgv: searchArgv,
            pPageNo: pageNo,
            pRowCount: rowCount
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * REST API 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
RestApiApi.prototype.restApiInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/rest-api', entry);
}

/********************************************************************************************
 * REST API 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
RestApiApi.prototype.restApiUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/rest-api', entry);
}

/********************************************************************************************
 * REST API 삭제
 * @param: 서비스코드
 * @return: 처리건수
 ********************************************************************************************/
RestApiApi.prototype.restApiDelete = function(pApiSeq, pLoading){
	var apiSeq = pApiSeq;
	var loadingYn = pLoading;
	
	if(isNull(apiSeq)) apiSeq = '';
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.delete('/system-manager/rest-api/'+apiSeq);
}
