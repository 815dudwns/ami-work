function CalendarApi(){}
var calendarApi = new CalendarApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 캘린더 리스트 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
CalendarApi.prototype.calendar = function(pUserId, pLoading){
	var userId = pUserId;
	var loadingYn = pLoading;
	
	if(isNull(userId)) userId = 'codefarm';
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/additional/calendar', 
	{
		//post는 data사용 
		params: {
            pUserId : userId
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 캘린더 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
CalendarApi.prototype.calendarInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;


	return axios.post('/additional/calendar', entry);
}

/********************************************************************************************
 * 캘린더 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
CalendarApi.prototype.calendarUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/additional/calendar', entry);
}


/********************************************************************************************
 * 캘린더 삭제
 * @param: User, 캘린더 SEQ
 * @return: 처리건수
 ********************************************************************************************/

CalendarApi.prototype.calendarDelete = function(pEntry, pLoading){	
	var entry = pEntry;
    var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
    
    return axios.delete('/additional/calendar', {
		params: {
            pUserId: pEntry.USER_ID,
            pCalSeq: pEntry.CAL_SEQ
    	},
    	loading: loadingYn
	});
}


/********************************************************************************************
 * 스케줄 리스트 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
CalendarApi.prototype.event = function(pUserId, pLoading){
	var userId = pUserId;
	var loadingYn = pLoading;
	
	if(isNull(userId)) userId = 'codefarm';
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/additional/calendar/event', 
	{
		//post는 data사용 
		params: {
            pUserId : userId
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 스케줄 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
CalendarApi.prototype.eventInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/additional/calendar/event', entry);
}

/********************************************************************************************
 * 스케줄 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
CalendarApi.prototype.eventUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/additional/calendar/event', entry);
}


/********************************************************************************************
 * 스케줄 삭제
 * @param: User, 캘린더 SEQ
 * @return: 처리건수
 ********************************************************************************************/

CalendarApi.prototype.eventDelete = function(pEntry, pLoading){	
	var entry = pEntry;
    var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

    return axios.delete('/additional/calendar/event', {
		params: {
            pUserId: pEntry.USER_ID,
            pIljeongSeq: pEntry.ILJEONG_SEQ
    	},
    	loading: loadingYn
	});
}



/********************************************************************************************
 * 스케줄 리스트 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
CalendarApi.prototype.env = function(pUserId, pLoading){
	var userId = pUserId;
	var loadingYn = pLoading;
	
	if(isNull(userId)) userId = 'codefarm';
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/additional/calendar/env', 
	{
		//post는 data사용 
		params: {
            pUserId : userId
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 스케줄 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
CalendarApi.prototype.envInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/additional/calendar/env', entry);
}

/********************************************************************************************
 * 스케줄 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
CalendarApi.prototype.envUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/additional/calendar/env', entry);
}


/********************************************************************************************
 * 스케줄 삭제
 * @param: User, 캘린더 SEQ
 * @return: 처리건수
 ********************************************************************************************/
CalendarApi.prototype.envDelete = function(pUserId, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/additional/calendar/env' + pUserId);
}

/********************************************************************************************
 * 국경일 추가
 * @param: 현재 년도
 * @return: 처리건수
 ********************************************************************************************/
CalendarApi.prototype.addHolidays = function(pEntry, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/additional/calendar/holidays', pEntry);
}
