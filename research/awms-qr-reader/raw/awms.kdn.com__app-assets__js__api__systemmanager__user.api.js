function UserApi() {}

var userApi = new UserApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 사용자 리스트 조회
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
UserApi.prototype.user = function(param, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/system-manager/user', {
		//post는 data사용 
		params: eval(param),
		loading: loadingYn
	});
};

/********************************************************************************************
 * 사용자 리스트 조회
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
UserApi.prototype.userSign = function(param, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/system-manager/user/sign', {
		//post는 data사용 
		params: eval(param),
		loading: loadingYn
	});
};


/********************************************************************************************
 * 사용자 리스트 조회
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
UserApi.prototype.userOrgSign = function(param, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/system-manager/user/orgsign', {
		//post는 data사용 
		params: eval(param),
		loading: loadingYn
	});
};

/********************************************************************************************
 * 사용자 리스트 조회
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
UserApi.prototype.userOrg = function(param, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/system-manager/user/org', {
		//post는 data사용 
		params: eval(param),
		loading: loadingYn
	});
};

/********************************************************************************************
 * 사용자 수정 (기관)
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.userOrgUpdate = function(pEntry, pLoading) {
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/system-manager/user/OrgUpdate', entry);
};

/********************************************************************************************
 * 가입 승인
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.userSignAdmission = function(pEntry, pLoading) {
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/system-manager/user/admission', entry);
};

/********************************************************************************************
 * 가입 승인
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.userOrgSignAdmission = function(pEntry, pLoading) {
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/system-manager/user/orgadmission', entry);
};

/********************************************************************************************
 * 기관회원 가입 반려
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.rejectOrgUser = function(pEntry, pLoading) {
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/system-manager/user/rejectOrg', entry);
};

/********************************************************************************************
 * 기업회원 가입 반려
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.rejectUser = function(pEntry, pLoading) {
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/system-manager/user/rejectUser', entry);
};

/********************************************************************************************
 * 기관회원 가입 반려
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.stopOrgUser = function(pEntry, pLoading) {
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/system-manager/user/stop', entry);
};


/********************************************************************************************
 * 사용자 아이디 중복 체크
 * @param: 사용자아이디
 * @return: 조회 리스트
 ********************************************************************************************/
UserApi.prototype.userIdChk = function(pUserId, pLoading) {
	var userId = pUserId;
	var loadingYn = pLoading;

	if(isNull(userId)) userId = '';
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/system-manager/user/useridchk', {
		//post는 data사용 
		params: {
			pUserId: userId
		},
		loading: loadingYn
	});
};

/********************************************************************************************
 * 사용자  추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.userInsert = function(pEntry, pLoading) {
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.post('/system-manager/user', entry);
};

/********************************************************************************************
 * 사용자 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.userUpdate = function(pEntry, pLoading) {
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/system-manager/user', entry);
};

/********************************************************************************************
 * 사용자 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.userInfoUpdate = function(pEntry, pLoading) {
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/system-manager/user/info', entry);
};
/********************************************************************************************
 * 사용자 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.userInfoOrgUpdate = function(pEntry, pLoading) {
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/system-manager/user/orginfo', entry);
};

/********************************************************************************************
 * 사용자 동기화
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.userSyncUpdate = function(pEntry, pLoading) {
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/system-manager/user/sync', {
		//post는 data사용
		params: {
			USER_ID: entry.USER_ID
		},
		loading: loadingYn
	});
};

/********************************************************************************************
 * 사용자 삭제
 * @param: 사용자 아이디
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.userDelete = function(pUserId, pLoading) {
	var userId = pUserId;
	var loadingYn = pLoading;

	if(isNull(userId)) userId = '';
	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/system-manager/user/' + userId);
};

/********************************************************************************************
 * 사용자 목록 삭제
 * @param: 사용자 목록
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.usersDelete = function(pUserList, pLoading) {
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;

	return axios.post('/system-manager/user/delete', {
		params: pUserList,
		loading: loadingYn
	});
};

/********************************************************************************************
 * 사용자 계정 순서  수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.updateUserPic = function(pEntry, pLoading) {
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/system-manager/user/pic', entry, {
		//post는 data사용
		params: {},
		loading: loadingYn
	});
};

/********************************************************************************************
 * 사용자 계정 패스워드 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.initUserPwd = function(param, pLoading) {
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.put('/system-manager/user/pwd/init', param, {
		loading: loadingYn
	});
};


/********************************************************************************************
 * 기업회원으로 전환
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.entChange = function(param, pLoading) {
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.put('/system-manager/user/entChange', param, {
		loading: loadingYn
	});
};

/********************************************************************************************
 * 기관회원으로 전환
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.orgChange = function(param, pLoading) {
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.put('/system-manager/user/orgChange', param, {
		loading: loadingYn
	});
};


/********************************************************************************************
 * 사용자 계정 패스워드 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.updateUserPwd = function(pUserId, pPwd, pNewPwd1, pNewPwd2, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;
	return axios.put('/system-manager/user/pwd', {
		//post는 data사용
		params: {
			pUserId: pUserId,
			pPwd: pPwd,
			pNewPwd1: pNewPwd1,
			pNewPwd2: pNewPwd2
		},
		loading: loadingYn
	});
};

/********************************************************************************************
 * 사용자 계정 순서 조회
 * @param: 사용자 아이디, 정렬구분
 * @return: 사용자 계정 순서 정보
 ********************************************************************************************/
UserApi.prototype.getUser = function(pUserId, pLoading) {
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/system-manager/user/id', {
		//post는 data사용
		params: {
			pUserId: pUserId
		},
		loading: loadingYn
	});
};

/********************************************************************************************
 * 사용자 계정 순서 조회
 * @param: 사용자 아이디, 정렬구분
 * @return: 사용자 계정 순서 정보
 ********************************************************************************************/
UserApi.prototype.getUserSort = function(pSortGb, pLoading) {
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/system-manager/user/sort', {
		//post는 data사용
		params: {
			pSortGb: pSortGb
		},
		loading: loadingYn
	});
};

/********************************************************************************************
 * 사용자 계정 순서  추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.insertUserSort = function(pUserId, pSortGb, pEntry, pLoading) {
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.post('/system-manager/user/sort', entry, {
		data: {
			pUserId: pUserId,
			pSortGb: pSortGb
		}
	});
};

/********************************************************************************************
 * 사용자 계정 순서  수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.updateUserSort = function(pUserId, pSortGb, pEntry, pLoading) {
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/system-manager/user/sort', entry, {
		//post는 data사용
		params: {
			pUserId: pUserId,
			pSortGb: pSortGb
		},
		loading: loadingYn
	});
};

/********************************************************************************************
 * 사용자 계정 순서  삭제
 * @param: 사용자 아이디, 정렬구분
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.deleteUserSort = function(pUserId, pSortGb, pLoading) {
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/system-manager/user/sort/' + pUserId, {
		//post는 data사용
		params: {
			pSortGb: pSortGb
		},
		loading: loadingYn
	});
};

/********************************************************************************************
 * 사용자 계정 순서 조회
 * @param: 사용자 아이디, 정렬구분
 * @return: 사용자 계정 순서 정보
 ********************************************************************************************/
UserApi.prototype.getUserAccount = function(pUserId, pLoading) {
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/system-manager/user/account', {
		//post는 data사용
		params: {
			pUserId: pUserId
		},
		loading: loadingYn
	});
};

/********************************************************************************************
 * 사용자 세션변경
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
UserApi.prototype.relogin = function(params, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/relogin', {
		//post는 data사용
		params: eval(params),
		loading: loadingYn
	});
};
UserApi.prototype.reloginBefore = function(params, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/reloginBefore', {
		//post는 data사용
		params: eval(params),
		loading: loadingYn
	});
};

/********************************************************************************************
 * 사용자 세션변경
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
UserApi.prototype.sessionChange = function(params, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/sessionChange', {
		//post는 data사용
		params: eval(params),
		loading: loadingYn
	});
};

/********************************************************************************************
 * 로그인 정보 추가
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
// UserApi.prototype.insertMemberDetail = function(idSysGb, pUserId, pLoading) {
// 	var loadingYn = pLoading;
//
// 	if(isNull(loadingYn)) loadingYn = false;
//
// 	return axios.post('/api/system-manager/user/insertMemberDetail', {
// 		idSysGb: idSysGb,
// 		pUserId: pUserId
// 	}, {
// 		loading: loadingYn
// 	});
// };

/********************************************************************************************
 * 사용자 정보 추가
 * @param: 
 * @return: 1
 ********************************************************************************************/
UserApi.prototype.userAdd = function(pLoading) {
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.post('/system-manager/user/user-add');
};

/********************************************************************************************
 * 기업회원 리스트 조회
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
UserApi.prototype.userEnterprise = function(param, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/system-manager/user/userEnterprise', {
		//post는 data사용
		params: eval(param),
		loading: loadingYn
	});
};

/********************************************************************************************
 * 표시여부 변경
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApi.prototype.enterpriseUseYnToggle = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/system-manager/user/enterpriseUseYnToggle', entry);
}

/********************************************************************************************
 * 지역본부, 지사 목록 조회
 * @param: 
 * @return: 조회 리스트
 ********************************************************************************************/
UserApi.prototype.getDeptList = function(){
	return axios.get('/system-manager/user/dept',{params: {}, loading: false});
}

/********************************************************************************************
 * 공통코드 조회
 * @param: 
 * @return: 조회 리스트
 ********************************************************************************************/
UserApi.prototype.getCommonList = function(){
	return axios.get('/system-manager/user/common',{params: {}, loading: false});
}