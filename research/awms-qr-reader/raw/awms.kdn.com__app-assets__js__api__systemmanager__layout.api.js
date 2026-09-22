function LayoutApi(){}
var layoutApi = new LayoutApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 레이아웃 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
LayoutApi.prototype.layout = function(param, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/system-manager/layout', 
	{
		params: eval(param),
    	loading: loadingYn
    });
} 

/********************************************************************************************
 * 레이아웃  추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
LayoutApi.prototype.layoutInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/layout', entry);
}

/********************************************************************************************
 * 레이아웃  수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
LayoutApi.prototype.layoutUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/layout', entry);
}


/********************************************************************************************
 * 레이아웃  삭제
 * @param: Alarm pk
 * @return: 처리건수
 ********************************************************************************************/
LayoutApi.prototype.layoutDelete = function(pUserPageSeq, pLoading, pUserId){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/system-manager/layout', {
		params: {
			pUserPageSeq: pUserPageSeq,
			pUserId : pUserId 
    	},
    	loading: loadingYn
	});
}

/********************************************************************************************
 * 레이아웃 컨텐츠 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
LayoutApi.prototype.layoutContent = function(param, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/system-manager/layout/content', 
	{
		params: eval(param),
    	loading: loadingYn
    });
} 

/********************************************************************************************
 * 레이아웃 컨텐츠  추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
LayoutApi.prototype.layoutContentInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/layout/content', entry);
}

/********************************************************************************************
 * 레이아웃 컨텐츠  수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
LayoutApi.prototype.layoutContentUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/layout/content', entry);
}


/********************************************************************************************
 * 레이아웃 컨텐츠  삭제
 * @param: Alarm pk
 * @return: 처리건수
 ********************************************************************************************/
LayoutApi.prototype.layoutContentDelete = function(pUserPageSeq, pLayoutContentSeq, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/system-manager/layout/content', {
		params: {
			pUserPageSeq: pUserPageSeq,
			pLayoutContentSeq: pLayoutContentSeq,
    	},
    	loading: loadingYn
	});
}
