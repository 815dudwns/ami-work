function AlertApi(){}
var alertApi = new AlertApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 알림  리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
AlertApi.prototype.alert = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/alert', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 알림  추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AlertApi.prototype.alertInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/alert', entry);
}

/********************************************************************************************
 * 알림  수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AlertApi.prototype.alertUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/alert', entry);
}


/********************************************************************************************
 * 알림  삭제
 * @param: Alarm pk
 * @return: 처리건수
 ********************************************************************************************/

AlertApi.prototype.alertDelete = function(pEntry, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/system-manager/alert', {
		params: {
            pAlarmSeq: pEntry.ALARM_SEQ,
    	},
    	loading: loadingYn
	});
}





/********************************************************************************************
 * 알림 대상 리스트 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
AlertApi.prototype.daesang= function(pAlarmSeq, pAlarmDaesangGb, pLoading){
    var alarmSeq = pAlarmSeq;
    var alarmDaesangGb = pAlarmDaesangGb;
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/system-manager/alert/daesang', 
	{
		//post는 data사용 
		params: {
            pAlarmSeq : pAlarmSeq,
            pAlarmDaesangGb : pAlarmDaesangGb,
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 알림 대상 유저 리스트 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
AlertApi.prototype.daesangUser= function(pParam, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/system-manager/alert/daesang-user', 
	{
		//post는 data사용 
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 알림 대상 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AlertApi.prototype.daesangInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/alert/daesang', entry);
}

/********************************************************************************************
 * 알림 대상 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AlertApi.prototype.daesangUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/alert/daesang', entry);
}


/********************************************************************************************
 * 알림 대상 삭제
 * @param: User, 캘린더 SEQ
 * @return: 처리건수
 ********************************************************************************************/

AlertApi.prototype.daesangDelete = function(pEntry, pLoading){	
	var entry = pEntry;
    var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
    return axios.delete('/system-manager/alert/daesang', {
		params: {
            pAlarmSeq: pEntry.ALARM_SEQ,
            pAlarmDaesangGb: pEntry.ALARM_DAESANG_GB,
            pDaesangjaId: pEntry.DAESANGJA_ID,
    	},
    	loading: loadingYn
	});
}

/********************************************************************************************
 * 사용자 알림설정 종류 가져오기
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
AlertApi.prototype.userAlarms = function(pLoading){
    var loadingYn = pLoading;
    
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/alert/user/alarms', 
	{
		params: {
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 사용자 알림설정 구독여부 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AlertApi.prototype.userAlarmSettingInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	return axios.post('/system-manager/alert/user/alarm', pEntry);
}

/********************************************************************************************
 * 사용자 알림설정 구독여부 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AlertApi.prototype.userAlarmSettingUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/alert/user/alarm', entry);
}

/********************************************************************************************
 * 사용자 알림설정 구독여부 삭제
 * @param: 앱 순번
 * @return: 처리건수
 ********************************************************************************************/
AlertApi.prototype.userAlarmSettingDelete = function(pAlarmSeq, pLoading){
	var alarmSeq = pAlarmSeq;
	var loadingYn = pLoading;
	
	if(isNull(alarmSeq)) alarmSeq = '';
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.delete('/system-manager/alert/user/alarm/'+alarmSeq);
}

/********************************************************************************************
 * 사용자 알림 데이터 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
AlertApi.prototype.getUserAlarmDataList = function(pAlarmMinTime, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/alert/user/alarm/datas', 
	{
		params: {
			pAlarmMinTime: pAlarmMinTime,
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 사용자 알림데이터 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AlertApi.prototype.userAlarmSettingUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/alert/user/alarm/data', entry);
}

/********************************************************************************************
 * 기업회원 마켓플레이스 관심 카테고리 설정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AlertApi.prototype.marketAlarmUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/system-manager/alert/user/marketAlramSave', entry);
}

/********************************************************************************************
 * 기업회원 마켓플레이스 관심 카테고리 조회
 * @param:
 * @return: 조회 데이터
 ********************************************************************************************/
AlertApi.prototype.marketAlarm = function(pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/system-manager/alert/user/marketAlarm',
		{
			loading: loadingYn
		});
}