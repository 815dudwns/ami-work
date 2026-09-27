function LinkplusApi(){}
var linkplusApi = new LinkplusApi(); // => 함수로 객체를 생성

/********************************************************************************************
 * 링크플러스 권한 조회
 * @param: 권한
 * @return: 조회 리스트
 ********************************************************************************************/
LinkplusApi.prototype.getLinkplusAuth = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/system-manager/link-plus/getLinkplusAuth',
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 링크플러스 권한 추가
 * @param: 권한,링크순번
 * @return: 처리건수
 ********************************************************************************************/
LinkplusApi.prototype.linkAuthInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.post('/system-manager/link-plus/inputLinkplusAuth', entry);
}

/********************************************************************************************
 * 링크플러스 권한 삭제
 * @param: 권한,링크순번
 * @return: 처리건수
 ********************************************************************************************/
LinkplusApi.prototype.linkAuthDelete = function(pEntry, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.delete('/system-manager/link-plus/removeLinkplusAuth', {
		params: pEntry,
    	loading: loadingYn
	});
}

/********************************************************************************************
 * 링크플러스 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
LinkplusApi.prototype.linkpluss = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/link-plus', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 링크플러스  추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
LinkplusApi.prototype.linkplusInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/link-plus', entry);
}

/********************************************************************************************
 * 링크플러스  수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
LinkplusApi.prototype.linkplusUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/link-plus', entry);
}

/********************************************************************************************
 * 링크플러스  삭제
 * @param: Alarm pk
 * @return: 처리건수
 ********************************************************************************************/
LinkplusApi.prototype.linkplusDelete = function(pEntry, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.delete('/system-manager/link-plus', {
		params: {
			'LINK_SEQ':pEntry.LINK_SEQ,
		},
    	loading: loadingYn
	});
}

/********************************************************************************************
 * 바로가기 위젯 URL SELECT
 * @param: APP_ID, WIDGET_SEQ
 * @return: URL 정보
 ********************************************************************************************/
LinkplusApi.prototype.getWidgetShctUrl = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/system-manager/link-plus/getWidgetShctUrl', {
		params: entry,
    	loading: loadingYn
	});
}

/********************************************************************************************
 * 바로가기 위젯 URL INSERT
 * @param: APP_ID, WIDGET_SEQ, SHCT_SEQ, SHCT_NM, SHCT_URL
 * @return: 처리건수
 ********************************************************************************************/
LinkplusApi.prototype.inputWidgetShctUrl = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.post('/system-manager/link-plus/inputWidgetShctUrl', entry);
}