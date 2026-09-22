function CommonApi(){}
var commonApi = new CommonApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 공통코드 리스트 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
CommonApi.prototype.common = function(pServiceType, pSearchType, pSearchArgv, pPageNo, pRowCount, pComCodeUpCd, pSysCdYn, pLoading){
    var serviceType = pServiceType;
    var searchType = pSearchType;
	var searchArgv = pSearchArgv;
    var pageNo = pPageNo;
    var rowCount = pRowCount;
	var comCodeUpCd = pComCodeUpCd;
    var loadingYn = pLoading;
    var restApiStr = "";
    
    if(isNull(serviceType)) serviceType = null;
	if(isNull(searchArgv)) searchArgv = '';
	if(isNull(searchType)){
		searchType = '';
		searchArgv = '';
	}
    if(isNull(pageNo)) pageNo = 1;
    if(isNull(rowCount)) rowCount = 5;
    if(isNull(comCodeUpCd) || comCodeUpCd=='') comCodeUpCd = pServiceType;
	if(isNull(loadingYn)) loadingYn = false;
    
    restApiStr = "/comm/" + pServiceType.toLowerCase() + "/codes";
   
    //    "/comm/{service}/codes"

    return axios.get(restApiStr,
	//return axios.get('/system-manager/common', 
	{
		//post는 data사용 
		params: {
            pServiceType: serviceType,
			pSearchType: searchType,
			pSearchArgv: searchArgv,
			pComCodeUpCd: comCodeUpCd,
            pPageNo: pageNo,
            pRowCount: rowCount,
            pSysCdYn: pSysCdYn
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 공통코드 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
CommonApi.prototype.commonInsert = function(pEntry, pLoading){
	var entry = pEntry;
    var loadingYn = pLoading;
    var restApiStr = "";
    

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
    
    restApiStr = "/comm/" + pEntry.SERVICE_CD.toLowerCase() + "/code";
    //alert(restApiStr);

    //return axios.post('/system-manager/common', entry);
    return axios.post(restApiStr, entry);
}

/********************************************************************************************
 * 공통코드 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
CommonApi.prototype.commonUpdate = function(pEntry, pLoading){
	var entry = pEntry;
    var loadingYn = pLoading;
    var restApiStr = "";
	
	if(isNull(entry)) entry = {};
    if(isNull(loadingYn)) loadingYn = false;
    
    restApiStr = "/comm/" + pEntry.SERVICE_CD.toLowerCase() + "/code";
	
    //return axios.put('/system-manager/common', entry);
    return axios.put(restApiStr, entry);
}

/********************************************************************************************
 * 공통코드 삭제
 * @param: 서비스코드
 * @return: 처리건수
 ********************************************************************************************/
CommonApi.prototype.commonDelete = function(pEntry, pLoading){
	var entry = pEntry;
    var loadingYn = pLoading;
    var restApiStr = "";
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
    
    restApiStr = "/comm/" + pEntry.SERVICE_CD.toLowerCase() + "/code";

    //return axios.delete('/system-manager/common/', {
	return axios.delete(restApiStr, {
		params: {
			UP_CD: pEntry.UP_CD,
			CD: pEntry.CD,
    	},
    	loading: loadingYn
	});
}

/********************************************************************************************
 * 커스텀 코드 명칭 리스트 조회 
 * @param:
 * @return: 조회 리스트
 ********************************************************************************************/
CommonApi.prototype.cd = function(pCd ,pLoading){
    var loadingYn = pLoading;
    var restApiStr = "";
    
    //restApiStr = "/comm/" + pEntry.SERVICE_CD.toLowerCase() + "/code";
    //alert(restApiStr);

	return axios.get('/system-manager/common/cd/' + pCd, 
	{
		//post는 data사용 
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 커스템 코드명 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
CommonApi.prototype.cdUpdate = function(pEntry, pLoading){
	var entry = pEntry;
    var loadingYn = pLoading;
    var restApiStr = "";
	
	if(isNull(entry)) entry = {};
    if(isNull(loadingYn)) loadingYn = false;
    
    //restApiStr = "/comm/" + pEntry.SERVICE_CD.toLowerCase() + "/code";
    //alert(restApiStr);
	
	return axios.patch('/system-manager/common', entry);
}