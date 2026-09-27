function AuthApi(){}
var authApi = new AuthApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 권한 리스트 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApi.prototype.auth = function(pUseYn, pAuthGb, pSearchType, pSearchArgv, pPageNo, pRowCount, pLoading){
    var useYn = pUseYn;
    var authGb = pAuthGb;
    var searchType = pSearchType;
	var searchArgv = pSearchArgv;
    var pageNo = pPageNo;
    var rowCount = pRowCount;
    var loadingYn = pLoading;
    
    if(isNull(useYn)) useYn = '';
    if(isNull(authGb)) authGb = '';
	if(isNull(searchArgv)) searchArgv = '';
	if(isNull(searchType)){
		searchType = '';
		searchArgv = '';
	}
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/auth', 
	{
		params: {
            pUseYn: useYn,
            pAuthGb: authGb,
			pSearchType: searchType,
			pSearchArgv: searchArgv,
	        pPageNo: pageNo,
            pRowCount: rowCount
    	},
    	loading: loadingYn
    });
}
/********************************************************************************************
 * 관리자별 하위관리자 권한 조회 
 * wjjoo 2022.03.15 추가
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApi.prototype.subAuthList = function(pSearchType, pSearchArgv, pLoading){
    var searchType = pSearchType;
	var searchArgv = pSearchArgv;
    var loadingYn = pLoading;
    
	if(isNull(searchType)){
		searchType = '';
		searchArgv = '';
	}
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/auth/subAuth', 
	{
		params: {
			pSearchType: searchType,
			pSearchArgv: searchArgv
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 권한 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AuthApi.prototype.authInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/auth', entry);
}

/********************************************************************************************
 * 권한 순번 가져오기
 * @param: 가져올 권한 구분
 * @return: 처리건수
 ********************************************************************************************/
AuthApi.prototype.getAuthSeq = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/auth/seq', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 권한 순번 가져오기
 * @param: 가져올 권한 구분
 * @return: 처리건수
 ********************************************************************************************/
AuthApi.prototype.getSortSeq = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/auth/sort-seq', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}



/********************************************************************************************
 * 권한 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AuthApi.prototype.authUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/auth', entry);
}


/********************************************************************************************
 * 권한 삭제
 * @param: User, 권한 SEQ
 * @return: 처리건수
 ********************************************************************************************/

AuthApi.prototype.authDelete = function(pEntry, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/system-manager/auth', {
		params: {
            pAuthCd: pEntry.AUTH_CD,
    	},
    	loading: loadingYn
	});
}



/********************************************************************************************
 * 앱권한 리스트 조회
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApi.prototype.appAllAuth = function(pAppId, pLoading){
	var loadingYn = pLoading;

	var appId = pAppId;
	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/system-manager/auth/appAllAuth',
		{
			//post는 data사용
			params: {
				pAppId : appId
			},
			loading: loadingYn
		});
}


/********************************************************************************************
 * 앱권한 리스트 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApi.prototype.appAuth = function(pAuthCd, pAppId, pLoading){
    var authCd = pAuthCd;
    var appId = pAppId;
	var loadingYn = pLoading;
	
    //if(isNull(authCd)) authCd = null;
    //if(isNull(appId)) appId = null;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/system-manager/auth/app', 
	{
		//post는 data사용 
		params: {
            pAuthCd : authCd,
            pAppId : appId
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 앱권한 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AuthApi.prototype.appAuthInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/auth/app', entry);
}

/********************************************************************************************
 * 앱권한 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AuthApi.prototype.appAuthUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/auth/app', entry);
}


/********************************************************************************************
 * 앱권한 삭제
 * @param: User, 권한 SEQ
 * @return: 처리건수
 ********************************************************************************************/

AuthApi.prototype.appAuthDelete = function(pEntry, pLoading){	
	var entry = pEntry;
    var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

    return axios.delete('/system-manager/auth/app', {
		params: {
            pAppId: pEntry.APP_ID,
            pAuthCd: pEntry.AUTH_CD
    	},
    	loading: loadingYn
	});
}




/********************************************************************************************
 * 사용자 추가권한 리스트 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApi.prototype.userAddAuth = function(pAuthCd, pUserId, pLoading){
    var authCd = pAuthCd;
    var userId = pUserId;
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/system-manager/auth/user-add', 
	{
		//post는 data사용 
		params: {
            pAuthCd : authCd,
            pUserId : userId
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 사용자 추가권한 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AuthApi.prototype.userAddAuthInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/auth/user-add', entry);
}

/********************************************************************************************
 * 사용자 추가권한 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AuthApi.prototype.userAddAuthUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/auth/user-add', entry);
}


/********************************************************************************************
 * 사용자 추가권한 삭제
 * @param: User, 권한 SEQ
 * @return: 처리건수
 ********************************************************************************************/
AuthApi.prototype.userAddAuthDelete = function(pEntry, pLoading){	
	var entry = pEntry;
    var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

    return axios.delete('/system-manager/auth/user-add', {
		params: {
            pUserId: pEntry.USER_ID,
            pAuthCd: pEntry.AUTH_CD
    	},
    	loading: loadingYn
	});
}

/********************************************************************************************
 * 추가권한 대상 유저 리스트 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApi.prototype.daesangUser = function(pAuthCd, pUserGroupGb, pUserStatusGb, pSearchArgv, pSearchDeptNm, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/system-manager/auth/user-add/daesang-user', 
	{
		//post는 data사용 
		params: {
            pAuthCd : pAuthCd,
            pUserGroupGb : pUserGroupGb,
            pUserStatusGb : pUserStatusGb,
            pSearchArgv : pSearchArgv,
			pSearchDeptNm : pSearchDeptNm,
    	},
    	loading: loadingYn
    });
}


/********************************************************************************************
 * 추가권한 대상 유저 리스트 조회 (기관별)
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApi.prototype.daesangUserOrg = function(pAuthCd, pUserGroupGb, pUserStatusGb, pSearchArgv, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/system-manager/auth/user-add/daesang-user-org', 
	{
		//post는 data사용 
		params: {
            pAuthCd : pAuthCd,
            pUserGroupGb : pUserGroupGb,
            pUserStatusGb : pUserStatusGb,
            pSearchArgv : pSearchArgv,
    	},
    	loading: loadingYn
    });
}


/********************************************************************************************
 * 사용자 추가권한 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AuthApi.prototype.userSubAddAuthInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/auth/subuser-add', entry);
}

/********************************************************************************************
 * 사용자 추가권한 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AuthApi.prototype.userSubAddAuthUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/auth/subuser-add', entry);
}


/********************************************************************************************
 * 사용자 추가권한 삭제
 * @param: User, 권한 SEQ
 * @return: 처리건수
 ********************************************************************************************/
AuthApi.prototype.userSubAddAuthDelete = function(pEntry, pLoading){	
	var entry = pEntry;
    var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

    return axios.delete('/system-manager/auth/subuser-add', {
		params: {
            pUserId: pEntry.USER_ID,
            pAuthCd: pEntry.AUTH_CD
    	},
    	loading: loadingYn
	});
}

/********************************************************************************************
 ************************************* IP접근제한관리 ***************************************
 ********************************************************************************************/
/********************************************************************************************
 * 접근허용 IP 리스트 조회
 * @param: 사용자ID, 접근허용IP, 사용자ID/명
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApi.prototype.ipRestrictedAccessMng = function(pUserId, pAllowIp, pUserIdNm, pPageNo, pRowCnt, pLoading){
	var userId = pUserId;
	var allowIp = pAllowIp;
	var userIdNm = pUserIdNm;
	var pageNo = pPageNo;
	var rowCnt = pRowCnt;
	var loadingYn = pLoading;
	
	if(isNull(userId)) userId = '';
	if(isNull(allowIp)) allowIp = '';
	if(isNull(userIdNm)) userIdNm = '';
	if(isNull(pageNo)) pageNo = '';
	if(isNull(rowCnt)) rowCnt = '';
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/system-manager/auth/ip-restricted-access-mng', 
	{
		//post는 data사용 
		params: {
			pUserId : userId,
			pAllowIp : allowIp,
			pUserIdNm : userIdNm,
			pPageNo: pageNo,
			pRowCnt: rowCnt
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 접근허용 IP 삽입
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AuthApi.prototype.ipRestrictedAccessMngInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/auth/ip-restricted-access-mng', entry);
}

/********************************************************************************************
 * 접근허용 IP 삭제
 * @param: 사용자ID, 접근허용IP
 * @return: 처리건수
 ********************************************************************************************/
AuthApi.prototype.ipRestrictedAccessMngDelete = function(pUserId, pAllowIp, pLoading){
	var userId = pUserId;
	var allowIp = pAllowIp;
	var loadingYn = pLoading;
	
	if(isNull(userId)) userId = '';
	if(isNull(allowIp)) allowIp = '';
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.delete('/system-manager/auth/ip-restricted-access-mng/' + userId + '/' + allowIp, {
		//post는 data사용 
		params: {
    	},
    	loading: loadingYn
	});
}

