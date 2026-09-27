function ProgramApi(){}
var programApi = new ProgramApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 프로그램 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
ProgramApi.prototype.programs = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/program', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 프로그램  추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
ProgramApi.prototype.programInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/program', entry);
}

/********************************************************************************************
 * 프로그램  수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
ProgramApi.prototype.programUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/program', entry);
}

/********************************************************************************************
 * 프로그램  삭제
 * @param: Alarm pk
 * @return: 처리건수
 ********************************************************************************************/
ProgramApi.prototype.programDelete = function(pEntry, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;
	return axios.delete('/system-manager/program', {
		params: {
			'SERVICE_CD':pEntry.SERVICE_CD,
			'PGM_ID':pEntry.PGM_ID,
		},
    	loading: loadingYn
	});
}
