function EtcApi(){}
var etcApi = new EtcApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 전국 초중고 조회
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
EtcApi.prototype.getAllSchoolList = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/api/etc/all-school-list', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}