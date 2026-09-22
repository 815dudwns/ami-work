function WidgetApi(){}
var widgetApi = new WidgetApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 위젯 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
WidgetApi.prototype.widget = function(pSearchAppId, pSearchType, pSearchArgv, pPageNo, pRowCount, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/system-manager/widget', 
	{
		//post는 data사용 
		params: {
			pSearchAppId: pSearchAppId,
			pSearchType: pSearchType,
			pSearchArgv: pSearchArgv,
			pPageNo: pPageNo,
			pRowCount: pRowCount
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 위젯 조회 
 * @param: 검색구분, 검색어
 * @return: 위젯 정보
 ********************************************************************************************/
WidgetApi.prototype.widgetId = function(pAppId, pWidgetSeq, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/system-manager/widget/'+pWidgetSeq, 
	{
		//post는 data사용 
		params: {
			pAppId: pAppId,
    	},
		//post는 data사용 
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 위젯  추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
WidgetApi.prototype.widgetInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/widget', entry);
}

/********************************************************************************************
 * 위젯  수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
WidgetApi.prototype.widgetUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/widget', entry);
}

/********************************************************************************************
 * 위젯  삭제
 * @param: 위젯 순번
 * @return: 처리건수
 ********************************************************************************************/
WidgetApi.prototype.widgetDelete = function(pAppId, pWidgetSeq, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.delete('/system-manager/widget/'+pWidgetSeq,
	{
		//post는 data사용 
		params: {
			pAppId: pAppId,
    	},
		//post는 data사용 
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 위젯 권한 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
WidgetApi.prototype.widgetAuth = function(pAppUseYn, pSearchType, pSearchArgv, pAuthCd, pPageNo, pRowCount, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/system-manager/widget/widget-auth', 
	{
		//post는 data사용 
		params: {
			pAppUseYn: pAppUseYn,
			pSearchType: pSearchType,
			pSearchArgv: pSearchArgv,
			pAuthCd : pAuthCd,
			pPageNo: pPageNo,
			pRowCount: pRowCount
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 위젯 권한 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
WidgetApi.prototype.widgetAuthInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/auth/widget-auth', entry);
}

/********************************************************************************************
 * 위젯 권한 삭제
 * @param: 위젯ID, 위젯SEQ, 권한 코드
 * @return: 처리건수
 ********************************************************************************************/
WidgetApi.prototype.widgetAuthDelete = function(pAppId, pWidgetSeq, pAuthCd, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.delete('/system-manager/auth/widget-auth',
	{
		//post는 data사용 
		params: {
			pAppId: pAppId,
			pWidgetSeq : pWidgetSeq,
			pAuthCd : pAuthCd
    	},
		//post는 data사용 
    	loading: loadingYn
    });
}
