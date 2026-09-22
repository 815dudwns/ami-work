function AmiwidgetApi(){}
var amiwidgetApi = new AmiwidgetApi(); // => 함수로 객체를 생성

/********************************************************************************************
 * 배너 개시 리스트
 * @param: 배너코드
 * @return: 처리건수
 ********************************************************************************************/
AmiwidgetApi.prototype.appListPosts = function(param, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/api/additional/amiwidget/post/', 
	{
		params: eval(param),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * AMI 현장관리 통계
 * @param: 
 * @return: 항목별 통계 건수
 ********************************************************************************************/
AmiwidgetApi.prototype.statPosts = function(param, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/api/additional/amiwidget/statPost/', 
	{
		params: eval(param),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 공지사항
 * @param: 
 * @return: 공지사항 리스트
 ********************************************************************************************/
AmiwidgetApi.prototype.noticePost = function(param, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/api/additional/amiwidget/noticePost/', 
	{
		params: eval(param),
    	loading: loadingYn
    });
}