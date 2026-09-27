function AlertApiApi(){}
var alertApiApi = new AlertApiApi(); // => 함수로 객체를 생성

/********************************************************************************************
 * 사용자 미확인 알림 데이터 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
AlertApiApi.prototype.getUserUnidentifiedAlarmDataList = function(pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/api/system-manager/alert/user/alarm/unidentified-alarms', 
	{
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 사용자 미확인 알림 카운트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
AlertApiApi.prototype.getUnidentifiedAlarmDataCnt = function(pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/api/system-manager/alert/user/alarm/unidentified-cnt', 
	{
    	loading: loadingYn
    });
}

