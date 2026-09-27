function MenuApiApi(){}
var menuApiApi = new MenuApiApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 사용자 앱 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
MenuApiApi.prototype.userAuthApps = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/api/system-manager/menu/user-auth-apps', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
};

/********************************************************************************************
 * 메뉴 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
MenuApiApi.prototype.userAuthMenus = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/api/system-manager/menu/user-auth-menus', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
};

/********************************************************************************************
 * 앱 메뉴 매뉴얼 조회 
 * @param: 앱 아이디, 메뉴 코드
 * @return: 메뉴의 매뉴얼
 ********************************************************************************************/
MenuApiApi.prototype.appMenuManual = function(pAppId, pMenuCd, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/api/system-manager/menu/'+pAppId+'/'+pMenuCd, 
	{
		//post는 data사용 
    	loading: loadingYn
    });
};