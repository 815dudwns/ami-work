function UserApiApi(){}
var userApiApi = new UserApiApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 사용자 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
UserApiApi.prototype.user = function(pParam, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/api/system-manager/user',pParam);
}

/********************************************************************************************
 * 사용자 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
UserApiApi.prototype.userByAuth = function(pParam, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/api/system-manager/user/byAuth', 
	{
		//post는 data사용 
		params: pParam,
    	loading: loadingYn
    });
}


/********************************************************************************************
 * 사용자 계정 순서 조회 
 * @param: 사용자 아이디, 정렬구분
 * @return: 사용자 계정 순서 정보
 ********************************************************************************************/
UserApiApi.prototype.getUser = function(pUserId, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/api/system-manager/user/id', 
	{
		//post는 data사용
		params: {
			pUserId: pUserId,
    	},
    	loading: loadingYn
    });
}
/********************************************************************************************
 * 사용자 조회 (SMN_USER)
 * @return: 사용자 정보 조회
 ********************************************************************************************/
UserApiApi.prototype.getUserPwd = function(){
	return axios.get('/api/system-manager/user/userPwd');
}
/********************************************************************************************
 * 사용자 회원가입
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApiApi.prototype.userInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
//	console.log(entry);
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/api/system-manager/user/userJoin', entry);
}
/********************************************************************************************
 * 사용자구분 
 * @return: 사용자구분명, 코드
 ********************************************************************************************/
UserApiApi.prototype.getUserGb = function(){
	return axios.get('/api/system-manager/user/userGb');
}

/********************************************************************************************
 * 사용자ID 중복체크
 * @return: 사용자ID
 ********************************************************************************************/
UserApiApi.prototype.getUserIdDoubleChk = function(pUserId){
	return axios.get('/api/system-manager/user/idDouleChk',{
		params: {
			pUserId: pUserId,
    	},
	});
}

/********************************************************************************************
 * 닉네임 중복체크
 * @return: 사용자ID
 ********************************************************************************************/
UserApiApi.prototype.getUserNickDoubleChk = function(pUserNick){
	return axios.get('/api/system-manager/user/nickDouleChk',{
		params: {
			pUserNick : pUserNick,
    	},
	});
}
/********************************************************************************************
 * 사용자 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApiApi.prototype.userUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/api/system-manager/user', entry);
}


/********************************************************************************************
 * 사용자  추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApiApi.prototype.userJoin = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/api/system-manager/user', entry);
}

/********************************************************************************************
 * 사용자  추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApiApi.prototype.userJoinConf = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/api/system-manager/user/userJoinConf', entry);
}

/********************************************************************************************
 * 비교과 강사 업데이트
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
UserApiApi.prototype.updateGangsaupdateUser = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/api/system-manager/user/updateGangsaupdateUser', entry);
}

/********************************************************************************************
 * 사용자 아이디 중복 체크 
 * @param: 사용자아이디
 * @return: 조회 리스트
 ********************************************************************************************/
UserApiApi.prototype.userIdChk = function(pUserId, pLoading){
	var userId = pUserId;
	var loadingYn = pLoading;
	
	if(isNull(userId)) userId = '';
	if(isNull(loadingYn)) loadingYn = false;
	return axios.get('/api/system-manager/user/useridchk', 
	{
		//post는 data사용 
		params: {
			pUserId: userId
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 사용자 아이디 중복 체크 
 * @param: 사용자아이디
 * @return: 조회 리스트
 ********************************************************************************************/
UserApiApi.prototype.setUserOtherSession = function(){
	return axios.get('/api/system-manager/user/setUserOtherSession', 
	{
		//post는 data사용 
		params: {},
    	loading: false
    });
}

