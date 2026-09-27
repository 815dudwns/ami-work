function AuthApiApi(){}
var authApiApi = new AuthApiApi(); // => 함수로 객체를 생성


/********************************************************************************************
 * 미인증된 사용자 조회
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApiApi.prototype.notAuthList = function(pAuthCd, pPageNo, pRowCnt, pLoading){
	var authCd = pAuthCd; 
	var loadingYn = pLoading;
	var pageNo 		= pPageNo;
	var rowCount 	= pRowCnt;
	
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/api/system-manager/auth/notAuthList', 
	{
		//post는 data사용 
		params: {
			pAuthCd : authCd,
			pPageNo: pageNo,
			pRowCnt: rowCount
    	},
    	loading: loadingYn
    });
}


/********************************************************************************************
 * 미인증된 사용자 조회
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApiApi.prototype.getAllAuthList = function(pEntry, pLoading){
	var entry = pEntry; 
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/api/system-manager/auth/getAllAuthList', {
		params: entry,
		loading: loadingYn
    });
}



/********************************************************************************************
 * 배정 권한 조회
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApiApi.prototype.baejeongAuthList = function(pEntry, pLoading){
	var entry = pEntry; 
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/api/system-manager/auth/baejeong-auth', 
	{
		//post는 data사용 
		params: entry,
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 상담사 권한 조회
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApiApi.prototype.sangdamsaList = function(pEntry, pLoading){
	var entry = pEntry; 
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/api/system-manager/auth/sangdamsa', 
	{
		//post는 data사용 
		params: entry,
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 산업체 정보 조회
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApiApi.prototype.companyList = function(pPageNo, pRowCnt, pLoading){
	var loadingYn = pLoading;
	var pageNo 		= pPageNo;
	var rowCount 	= pRowCnt;
	
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/api/system-manager/auth/companyList', 
	{
		//post는 data사용 
		params: {
			pPageNo: pageNo,
			pRowCnt: rowCount
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 산업체 정보 인증 산업체로 업데이트
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AuthApiApi.prototype.updateCompany = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/api/system-manager/auth/updateCompany', entry);
}

/********************************************************************************************
 * 산업체 인증산업체로 선택승인
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AuthApiApi.prototype.updateCompanyChk = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/api/system-manager/auth/updateCompanyChk', entry);
}

/********************************************************************************************
 * 상담사 정보 인증 상담사로 업데이트
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AuthApiApi.prototype.updateSangdamsa = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/api/system-manager/auth/updateSangdamsa', entry);
}

/********************************************************************************************
 * 상담사 인증상담사로 선택승인
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AuthApiApi.prototype.updateSangdamsaChk = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/api/system-manager/auth/updateSangdamsaChk', entry);
}
/********************************************************************************************
 * 미승인된 강사 조회
 * @param: 페이지 번호, RowCnt, 로딩
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApiApi.prototype.ncuGangsaList = function(pPageNo, pRowCnt, pLoading){
	var loadingYn = pLoading;
	var pageNo 		= pPageNo;
	var rowCount 	= pRowCnt;
	
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/api/system-manager/auth/ncuGangsaList', 
	{
		//post는 data사용 
		params: {
			pPageNo: pageNo,
			pRowCnt: rowCount
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 승인된 강사 조회
 * @param: 페이지 번호, RowCnt, 로딩
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApiApi.prototype.ncuGangsaApprovalList = function(pUserNm,pPageNo, pRowCnt, pLoading, pUserStatusGb, pDeptNm){
	var loadingYn = pLoading;
	var userNm    = pUserNm
	var pageNo 		= pPageNo;
	var rowCount 	= pRowCnt;
	var userStatusGb =  pUserStatusGb;
	var deptNm =  pDeptNm;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/api/system-manager/auth/approvalGangsaList', 
	{
		//post는 data사용 
		params: {
			pUserNm : userNm,
			pPageNo: pageNo,
			pRowCnt: rowCount,
			pUserStatusGb : userStatusGb,
			pDeptNm : deptNm
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 비교과 강사 정보 인증 비교과 강사로 업데이트
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AuthApiApi.prototype.updateNcuGangsa = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/api/system-manager/auth/updateNcuGangsa', entry);
}
/********************************************************************************************
 * 산업체 인증산업체로 선택승인
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AuthApiApi.prototype.updateNcuGangsaChk = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/api/system-manager/auth/updateNcuGangsaChk', entry);
}

/********************************************************************************************
 * 사용자 추가권한 리스트 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApiApi.prototype.userAddAuth= function(pAuthCd, pUserId, pLoading){
    var authCd = pAuthCd;
    var userId = pUserId;
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/api/system-manager/auth/user-add', 
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
 * 사용자 추가권한 리스트 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApiApi.prototype.userAuth= function(pAppId, pMenuCd, pPageNo, pRowCnt, pLoading){
    var appId = pAppId;
    var menuCd = pMenuCd;
	var pageNo = pPageNo;
	var rowCnt = pRowCnt;
	var loadingYn = pLoading;
	
	if(isNull(appId)) appId = '';
	if(isNull(menuCd)) menuCd = '';
	if(isNull(pageNo)) pageNo = '';
	if(isNull(rowCnt)) rowCnt = '';
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/api/system-manager/auth/user-auth', 
	{
		//post는 data사용 
		params: {
			pAppId : appId,
			pMenuCd : menuCd
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 비교과 강사 정보 인증 비교과 강사로 업데이트
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
AuthApiApi.prototype.getConnCounselor = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/api/system-manager/auth/conn-counselor', entry);
}

/********************************************************************************************
 * 사용자 추가권한 리스트 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
AuthApiApi.prototype.authList= function(pAppId, pMenuCd, pPageNo, pRowCnt, pLoading){
    var appId = pAppId;
    var menuCd = pMenuCd;
	var pageNo = pPageNo;
	var rowCnt = pRowCnt;
	var loadingYn = pLoading;
	
	if(isNull(appId)) appId = '';
	if(isNull(menuCd)) menuCd = '';
	if(isNull(pageNo)) pageNo = '';
	if(isNull(rowCnt)) rowCnt = '';
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/api/system-manager/auth/user-auth', 
	{
		//post는 data사용 
		params: {
			pAppId : appId,
			pMenuCd : menuCd
    	},
    	loading: loadingYn
    });
}