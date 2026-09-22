function CalendarApiApi(){}
var calendarApiApi = new CalendarApiApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 달력 조회 
 * @param: -
 * @return: 조회 리스트
 ********************************************************************************************/
CalendarApiApi.prototype.calendar = function(pCurdate, pLoading){
	return axios.get('/api/additional/calendar/calendar', 
	{
		//post는 data사용 
		params: {
			pCurdate: pCurdate
    	},
    	loading: pLoading
    });
}

/********************************************************************************************
 * 일정 조회
 * @param: -
 * @return: 조회 리스트
 ********************************************************************************************/
CalendarApiApi.prototype.selectCalendar = function(pLoading){
	return axios.get('/api/additional/calendar/selectcalendar', 
	{
		//post는 data사용 
		params: {
    	},
    	loading: pLoading
    });
}
