function BoardApiApi(){}
var boardApiApi = new BoardApiApi(); // => 함수로 객체를 생성

/********************************************************************************************
 * 게시판 - 위젯 - 일반, 탭, 일반이미지, 4컷이미지 조회
 * @param: 위젯의 게시판 순번, 검색할 개수
 * @return: 게시판 목록
 ********************************************************************************************/
BoardApiApi.prototype.getWidgetList = function(pBoardSeq, pSearchCount, pLoading){
	var loadingYn = pLoading;
	var searchCount = pSearchCount;
	if(isNull(loadingYn)) loadingYn = false;
	if(isNull(searchCount)) searchCount = 1;
	
	return axios.get('/api/additional/board/widget/' + pBoardSeq, 
	{
		params: {
			pSearchCount:searchCount
		},
    	loading: loadingYn
    });
};

/********************************************************************************************
 * 게시판 - 위젯 - 공지사항 리스트
 * @param:  검색할 개수
 * @return: 게시판 목록
 ********************************************************************************************/
BoardApiApi.prototype.getNoticeList = function(pConf,pSearchCount, pLoading){
	var loadingYn = pLoading;
	var searchCount = pSearchCount;
	if(isNull(loadingYn)) loadingYn = false;
	if(isNull(searchCount)) searchCount = 1;

	return axios.get('/api/additional/board/widget/notice',
		{
			params: {
				confYn : pConf,
				pSearchCount:searchCount
			},
			loading: loadingYn
		});
};

/********************************************************************************************
 * 게시판 - 위젯 - 공지사항 리스트
 * @param:  검색할 개수
 * @return: 게시판 목록
 ********************************************************************************************/
BoardApiApi.prototype.getMarketList = function(pSearchCount, pLoading){
	var loadingYn = pLoading;
	var searchCount = pSearchCount;
	if(isNull(loadingYn)) loadingYn = false;
	if(isNull(searchCount)) searchCount = 1;

	return axios.get('/api/additional/board/widget/market',
		{
			params: {
				pSearchCount:searchCount
			},
			loading: loadingYn
		});
};

/********************************************************************************************
 * 게시판 - 위젯 - 활동내역
 * @param:  검색할 개수
 * @return: 게시판 목록
 ********************************************************************************************/
BoardApiApi.prototype.getActiveList = function(pSearchCount, pLoading){
	var loadingYn = pLoading;
	var searchCount = pSearchCount;
	if(isNull(loadingYn)) loadingYn = false;
	if(isNull(searchCount)) searchCount = 1;

	return axios.get('/api/additional/board/widget/active',
		{
			params: {
				pSearchCount:searchCount
			},
			loading: loadingYn
		});
};

/********************************************************************************************
 * 게시판 - 위젯 - 컨퍼런스 전시제품
 * @param:  검색할 개수
 * @return: 게시판 목록
 ********************************************************************************************/
BoardApiApi.prototype.getConfList = function(pSearchCount, pLoading){
	var loadingYn = pLoading;
	var searchCount = pSearchCount;
	if(isNull(loadingYn)) loadingYn = false;
	if(isNull(searchCount)) searchCount = 1;

	return axios.get('/api/additional/board/widget/conf',
		{
			params: {
				pSearchCount:searchCount
			},
			loading: loadingYn
		});
};

/********************************************************************************************
 * 게시판 정보 조회
 * @param: BOARD_SEQ
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApiApi.prototype.getBoardInfo = function(pBoardSeq, pLoading){
	var boardSeq = pBoardSeq;
	var loadingYn = pLoading;

	if(isNull(boardSeq)) return;
	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/api/additional/board/' + boardSeq);
}

/********************************************************************************************
 * 게시판에 부여된 권한 조회 
 * @param: 게시판 순번, 컨트롤러에서의 사용자 세션 권한
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApiApi.prototype.authInfo = function(pBoardSeq, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('api/additional/board/auth-gb/' + pBoardSeq,
	{
		//post는 data사용 
		params: {
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 게시판 리스트 조회
 * @param: BOARD_SEQ
 * @return: 게시판 목록
 ********************************************************************************************/
BoardApiApi.prototype.getPostList = function(pBoardSeq, pBoardGb, pCategory, pSearchType, pSearchArgv, pPageNo, pRowCount, pPostNo, pMainYn, pLoading) {
	var boardSeq = pBoardSeq;
	var boardGb = pBoardGb;
	var category = pCategory;
	var searchType = pSearchType;
	var searchArgv = pSearchArgv;
	var pageNo = pPageNo;
	var rowCount = pRowCount;
	var postNo = pPostNo;
	var mainYn = pMainYn;
	var loadingYn = pLoading;

	if(isNull(searchArgv)) searchArgv = '';
	if(isNull(searchType)){
		searchType = '';
		searchArgv = '';
	}
	if(isNull(pageNo)) pageNo = 1;
	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/api/additional/board/list', {
		params: {
			pBoardSeq: boardSeq,
			pBoardGb: boardGb,
			pCategory: category,
			pSearchType: searchType,
			pSearchArgv: searchArgv,
			pPageNo: pageNo,
			pRowCount: rowCount,
			pPostNo: postNo,
			pMainYn : mainYn
		},
		loading: loadingYn
	});
};

/********************************************************************************************
 * 게시판 게시글 상세 조회
 * @param: POST_NO, TITLE
 * @return: 게시판 목록
 ********************************************************************************************/
BoardApiApi.prototype.getPost = function(paramObj, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/api/additional/board/post', {
		params: paramObj,
		loading: loadingYn
	});
};


/********************************************************************************************
 * 게시판 POST 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BoardApiApi.prototype.postInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.post('/api/additional/board/post', entry);
}

/********************************************************************************************
 * 게시판 POST 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BoardApiApi.prototype.postUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/api/additional/board/post', entry);
}

/********************************************************************************************
 * 게시판 POST 삭제(실제 삭제가 아닌 삭제 FLAG[DELETE_YN] 설정, 논리 삭제)
 * @param: 게시판 SEQ
 * @return: 처리건수
 ********************************************************************************************/
BoardApiApi.prototype.postDelete = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/api/additional/board/post', {
		params: {
			pPostNo: pEntry.POST_NO
		},
		loading: loadingYn
	});
};

/********************************************************************************************
 * 게시판 게시글 댓글 조회
 * @param: POST_NO, TITLE
 * @return: 게시판 목록
 ********************************************************************************************/
BoardApiApi.prototype.getPostCm = function(pPostNo, pPageNo, pRowCount, pLoading){
	var postNo = pPostNo;
	var pageNo = pPageNo;
	var loadingYn = pLoading;
	var rowCount = pRowCount;

	if(isNull(postNo)) postNo = null;
	if(isNull(pageNo)) pageNo = 1;
	if(isNull(rowCount)) pageNo = 5;
	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/api/additional/board/post/cm',
		{
			//post는 data사용
			params: {
				pPostNo: postNo,
				pPageNo: pageNo,
				pRowCount: rowCount
			},
			loading: loadingYn
		});
};

/********************************************************************************************
 * 게시판 댓글 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BoardApiApi.prototype.insertPostCm = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.post('/api/additional/board/post/cm', entry);
}

/********************************************************************************************
 * 게시판 댓글 삭제(논리 삭제)
 * @param: 댓글 삭제 객체
 * @return: 처리건수
 ********************************************************************************************/
BoardApiApi.prototype.deletePostCm = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/api/additional/board/post/cm', {
		params: {
			pPostNo: pEntry.POST_NO,
			pCmSeq: pEntry.CM_SEQ,
		},
		loading: loadingYn
	});
}

/********************************************************************************************
 * 게시판 댓글 카운트 업데이트
 * @param: 수정 할 정보(json object), 양수(true)/음수(false)
 * @return: 처리건수
 ********************************************************************************************/
BoardApiApi.prototype.postUpdateCmCount = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/api/additional/board/post/cm/count', entry);
}

/********************************************************************************************
 * 좋아요 등록 체크
 * @param: 조회 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BoardApiApi.prototype.checkLike = function(pParam, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/api/additional/board/post/like',
		{
			params: pParam,
			loading: loadingYn
		});
}
/********************************************************************************************
 * 좋아요 등록
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BoardApiApi.prototype.postLike = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.post('/api/additional/board/post/like', entry);
}

/********************************************************************************************
 * 좋아요 삭제
 * @param: 좋아요 삭제 객체
 * @return: 처리건수
 ********************************************************************************************/
BoardApiApi.prototype.postLikeCancel = function (paramObj, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/api/additional/board/post/like',{
		params : paramObj,
		loading : loadingYn
	});
}

/********************************************************************************************
 * 게시판 좋아요 카운트 업데이트
 * @param: 수정 할 정보(json object), 양수(true)/음수(false)
 * @return: 처리건수
 ********************************************************************************************/
BoardApiApi.prototype.postUpdateLikeCount = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/api/additional/board/post/like', entry);
}


/********************************************************************************************
 * 문의게시판 답글 상세 조회
 * @param: POST_NO, TITLE
 * @return: 게시판 목록
 ********************************************************************************************/
BoardApiApi.prototype.getAnswer = function(paramObj, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/api/additional/board/post/answer', {
		params: paramObj,
		loading: loadingYn
	});
};

/********************************************************************************************
 * 게시판 카운트 업데이트
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BoardApiApi.prototype.boardPostUpdateCount = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/api/additional/board/post/count', entry);
}

/********************************************************************************************
 * 기관 관리 조회
 * @param: 검색구분
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApiApi.prototype.totSearch = function(paramObj, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;

	 return axios.get('/api/additional/board/totSearch', {
	 	//post는 data사용
	 	params: paramObj,
	 	loading: loadingYn
	 });
};

/********************************************************************************************
 * 메인 공지사항 조회
 * @param: 검색구분
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApiApi.prototype.mainNotice = function(paramObj, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/api/additional/board/mainNotice', {
		//post는 data사용
		params: paramObj,
		loading: loadingYn
	});
};

/********************************************************************************************
 * 메인 공지팝업 조회
 * @param: 검색구분
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApiApi.prototype.popupSearch = function(paramObj, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/api/additional/board/popupSearch', {
		//post는 data사용
		params: paramObj,
		loading: loadingYn
	});
};

/********************************************************************************************
 * 최신 게시글 조회
 * @param: 검색구분
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApiApi.prototype.newPost = function(paramObj, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/api/additional/board/newPost', {
		//post는 data사용
		params: paramObj,
		loading: loadingYn
	});
};

/********************************************************************************************
 * 최신 인기글 조회
 * @param: 검색구분
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApiApi.prototype.newPopularity = function() {

	return axios.get('/api/additional/board/newPopularity', {});
};

/********************************************************************************************
 * 최신 팁 & 태크 조회
 * @param: 검색구분
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApiApi.prototype.newTipTech = function() {

	return axios.get('/api/additional/board/newTipTech', {});
};

/********************************************************************************************
 * 최신 IT 자료실 조회
 * @param: 검색구분
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApiApi.prototype.newITReference = function() {

	return axios.get('/api/additional/board/newITReference', {});
};

/********************************************************************************************
 * 최신 IT 교육 세미나 조회
 * @param: 검색구분
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApiApi.prototype.newEduSeminar = function() {

	return axios.get('/api/additional/board/newEduSeminar', {});
};

/********************************************************************************************
 * 최신 프로모션 /이벤트 조회
 * @param: 검색구분
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApiApi.prototype.newPromotionEvent = function() {

	return axios.get('/api/additional/board/newPromotionEvent', {});
};

/********************************************************************************************
 * 최신 지역별 협의회 세미나 조회
 * @param: 검색구분
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApiApi.prototype.newAreaSeminar = function() {

	return axios.get('/api/additional/board/newAreaSeminar', {});
};

/********************************************************************************************
 * 최신 지역별 협의회 게시판 조회
 * @param: 검색구분
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApiApi.prototype.newAreaBoard = function() {

	return axios.get('/api/additional/board/newAreaBoard', {});
};

/********************************************************************************************
 * 세미나 참가신청 조회
 * @param: 검색구분
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApiApi.prototype.seminarJoin = function(paramObj) {

	return axios.get('/api/additional/board/seminarJoin', {
		//post는 data사용
		params: paramObj,
	});
};

/********************************************************************************************
 * 세미나 참가신청 권한조회
 * @param: 검색구분
 * @return: 권한 boolean
 ********************************************************************************************/
BoardApiApi.prototype.seminarJoinAuth = function() {

	return axios.get('/api/additional/board/seminarJoinAuth');
};

/********************************************************************************************
 * 게시판 리스트 조회
 * @param: BOARD_SEQ
 * @return: 게시판 목록
 ********************************************************************************************/
BoardApiApi.prototype.getAllNoticeBoard = function(pBoardSeq, pBoardGb, pCategory, pSearchType, pSearchArgv, pPageNo, pRowCount, pPostNo, pLoading) {
	var boardSeq = pBoardSeq;
	var boardGb = pBoardGb;
	var category = pCategory;
	var searchType = pSearchType;
	var searchArgv = pSearchArgv;
	var pageNo = pPageNo;
	var rowCount = pRowCount;
	var postNo = pPostNo;
	var loadingYn = pLoading;

	if(isNull(searchArgv)) searchArgv = '';
	if(isNull(searchType)){
		searchType = '';
		searchArgv = '';
	}
	if(isNull(pageNo)) pageNo = 1;
	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/api/additional/board/all/notice', {
		params: {
			pBoardSeq: boardSeq,
			pBoardGb: boardGb,
			pCategory: category,
			pSearchType: searchType,
			pSearchArgv: searchArgv,
			pPageNo: pageNo,
			pRowCount: rowCount,
			pPostNo: postNo
		},
		loading: loadingYn
	});
};