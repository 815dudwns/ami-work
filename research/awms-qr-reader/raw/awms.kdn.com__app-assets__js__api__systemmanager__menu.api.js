function MenuApi(){}
var menuApi = new MenuApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 메뉴 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
MenuApi.prototype.menus = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/menu', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 메뉴 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
MenuApi.prototype.userAuthMenus = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/menu/user-auth-menus', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 메뉴  추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
MenuApi.prototype.menuInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/menu', entry);
}

/********************************************************************************************
 * 메뉴  수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
MenuApi.prototype.menuUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/menu', entry);
}

/********************************************************************************************
 * 메뉴  삭제
 * @param: Alarm pk
 * @return: 처리건수
 ********************************************************************************************/
MenuApi.prototype.menuDelete = function(pEntry, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;
	return axios.delete('/system-manager/menu', {
		params: {
			'APP_ID':pEntry.APP_ID,
			'MENU_CD':pEntry.MENU_CD,
		},
    	loading: loadingYn
	});
}




/********************************************************************************************
 * 메뉴 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
MenuApi.prototype.menuAuths = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/menu/auths', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 메뉴  추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
MenuApi.prototype.menuAuthInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/menu/auth', entry);
}

/********************************************************************************************
 * 메뉴  수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
MenuApi.prototype.menuAuthUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/menu/auth', entry);
}

/********************************************************************************************
 * 메뉴  삭제
 * @param: Alarm pk
 * @return: 처리건수
 ********************************************************************************************/
MenuApi.prototype.menuAuthDelete = function(pEntry, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;
	return axios.delete('/system-manager/menu/auth', {
		params: {
			'APP_ID':pEntry.APP_ID,
			'MENU_CD':pEntry.MENU_CD,
			'AUTH_CD':pEntry.AUTH_CD,
		},
    	loading: loadingYn
	});
}



/********************************************************************************************
 * 메뉴 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
MenuApi.prototype.menus = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/menu', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 하위 프로그램 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
MenuApi.prototype.subPgms = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/menu/sub-pgm', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 하위 프로그램  추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
MenuApi.prototype.subPgmInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/menu/sub-pgm', entry);
}

/********************************************************************************************
 * 하위 프로그램  수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
MenuApi.prototype.subPgmUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/menu/sub-pgm', entry);
}

/********************************************************************************************
 * 하위 프로그램  삭제
 * @param: Alarm pk
 * @return: 처리건수
 ********************************************************************************************/
MenuApi.prototype.subPgmDelete = function(pEntry, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;
	return axios.delete('/system-manager/menu/sub-pgm', {
		params: {
			'APP_ID':pEntry.APP_ID,
			'MENU_CD':pEntry.MENU_CD,
			'SERVICE_CD':pEntry.SERVICE_CD,
			'PGM_ID':pEntry.PGM_ID,
		},
    	loading: loadingYn
	});
}

/********************************************************************************************
 * 앱 메뉴 매뉴얼 조회 
 * @param: 앱 아이디, 메뉴 코드
 * @return: 메뉴의 매뉴얼
 ********************************************************************************************/
MenuApi.prototype.appMenuManual = function(pAppId, pMenuCd, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/system-manager/menu/'+pAppId+'/'+pMenuCd, 
	{
		//post는 data사용 
    	loading: loadingYn
    });
};

/********************************************************************************************
 * 앱 매뉴 매뉴얼 신규
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
MenuApi.prototype.appMenuManualInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/menu/manual', entry);
};

/********************************************************************************************
 * 앱 매뉴 매뉴얼 수정
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
MenuApi.prototype.appMenuManualUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/menu/manual', entry);
};


/********************************************************************************************
 * 앱 매뉴 매뉴얼 삭제
 * @param: 앱 아이디, 메뉴코드
 * @return: 처리건수
 ********************************************************************************************/
MenuApi.prototype.appMenuManualDelete = function(pAppId, pMenuCd, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.delete('/system-manager/menu/manual/'+pAppId+'/'+pMenuCd);
};


/********************************************************************************************
 * 앱 매뉴 매뉴얼 신규
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
MenuApi.prototype.appMenuAuthBatchInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.post('/system-manager/menu/auth-batch', entry);
};


/********************************************************************************************
 * 앱 매뉴 매뉴얼 삭제
 * @param: 앱 아이디, 메뉴코드
 * @return: 처리건수
 ********************************************************************************************/
MenuApi.prototype.appMenuAuthBatchDelete = function(pEntry, pLoading){
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/system-manager/menu/auth-batch', {
		params: {
			'APP_ID':pEntry.APP_ID,
			'AUTH_CD':pEntry.AUTH_CD,
		},
		loading: loadingYn
	});
};