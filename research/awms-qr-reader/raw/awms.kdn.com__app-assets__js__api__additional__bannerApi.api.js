function BannerApiApi(){}
var bannerApiApi = new BannerApiApi(); // => 함수로 객체를 생성

/********************************************************************************************
 * 배너 개시 리스트
 * @param: 배너코드
 * @return: 처리건수
 ********************************************************************************************/
BannerApiApi.prototype.bannerPosts = function(param, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/api/additional/banner/post/', 
	{
		params: eval(param),
    	loading: loadingYn
    });
}

