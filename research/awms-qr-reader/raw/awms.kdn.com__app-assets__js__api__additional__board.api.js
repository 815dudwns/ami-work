function BoardApi(){}
var boardApi = new BoardApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 게시판 리스트 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApi.prototype.board = function(pBoardGb, pUseYn, pSearchType, pSearchArgv, pPageNo, pRowCount, pLoading){
	var boardGb = pBoardGb;
	var useYn = pUseYn;
	var searchType = pSearchType;
	var searchArgv = pSearchArgv;
    var pageNo = pPageNo;
    var rowCount = pRowCount;
	var loadingYn = pLoading;
	
	if(isNull(boardGb)) boardGb = '';
	if(isNull(useYn)) useYn = '';
	if(isNull(searchArgv)) searchArgv = '';
	if(isNull(searchType)){
		searchType = '';
		searchArgv = '';
	}
	if(isNull(pageNo)) pageNo = 1;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/additional/board', 
	{
		//post는 data사용 
		params: {
			pBoardGb : boardGb,
			pUseYn : useYn,
			pSearchType: searchType,
			pSearchArgv: searchArgv,
            pPageNo: pageNo,
            pRowCount: rowCount
    	},
    	loading: loadingYn
    });
}


/********************************************************************************************
 * 게시판 단건 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApi.prototype.boardBySeq = function(pBoardSeq, pLoading){
	var boardSeq = pBoardSeq;
	var loadingYn = pLoading;
	
	if(isNull(boardSeq)) return;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/additional/board/' + boardSeq);
}

/********************************************************************************************
 * 게시판 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BoardApi.prototype.boardInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/additional/board', entry);
}

/********************************************************************************************
 * 게시판 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BoardApi.prototype.boardUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/additional/board', entry);
}

/********************************************************************************************
 * 게시판 삭제
 * @param: 게시판 SEQ
 * @return: 처리건수
 ********************************************************************************************/
BoardApi.prototype.boardDelete = function(pBoardSeq, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/additional/board/' + pBoardSeq);
}

/********************************************************************************************
 * 게시판 POST 리스트 조회 
 * @param: 검색구분, 검색어, 공통코드 상위 코드
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApi.prototype.boardPost = function(pBoardSeq, pBoardGb, pSearchType, pSearchArgv, pPageNo, pRowCount, pPostNo, pLoading){
	var boardSeq = pBoardSeq;
	var boardGb = pBoardGb;
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
	
	return axios.get('/additional/board/post', 
	{
		//post는 data사용 
		params: {
			pBoardSeq: boardSeq,
			pBoardGb: boardGb,
			pSearchType: searchType,
			pSearchArgv: searchArgv,
            pPageNo: pageNo,
            pRowCount: rowCount,
            pPostNo: postNo
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 게시판 POST 리스트 CONTENTS 조회
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApi.prototype.boardPostContents = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/additional/board/post/contents', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 게시판 POST 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BoardApi.prototype.boardPostInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/additional/board/post', entry);
}

/********************************************************************************************
 * 게시판 카운트 업데이트
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BoardApi.prototype.boardPostUpdateCount = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/additional/board/post/count', entry);
}

/********************************************************************************************
 * 게시판 카운트 업데이트
 * @param: 수정 할 정보(json object), 양수(true)/음수(false)
 * @return: 처리건수
 ********************************************************************************************/
BoardApi.prototype.boardPostUpdateCmCount = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/additional/board/post/cm', entry);
}

/********************************************************************************************
 * 게시판 POST 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BoardApi.prototype.boardPostUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/additional/board/post', entry);
}

/********************************************************************************************
 * 게시판 POST 삭제(실제 삭제가 아닌 삭제 FLAG[DELETE_YN] 설정, 논리 삭제)
 * @param: 게시판 SEQ
 * @return: 처리건수
 ********************************************************************************************/
BoardApi.prototype.boardPostDelete = function(pEntry, pLoading){	
	var entry = pEntry;
    var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
    
    return axios.delete('/additional/board/post/', {
		params: {
			pPostNo: pEntry.POST_NO
    	},
    	loading: loadingYn
	});

}

/********************************************************************************************
 * 게시판 POST 삭제 (실제 데이터 삭제, 물리 삭제)
 * @param: 게시판 SEQ
 * @return: 처리건수
 ********************************************************************************************/
BoardApi.prototype.boardPostRemove = function(pEntry, pLoading){
    var entry = pEntry;
	var loadingYn = pLoading;
    
    if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/additional/board/post/remove/', {
		params: {
			pPostNo: pEntry.POST_NO
    	},
    	loading: loadingYn
	});

}





/********************************************************************************************
 * 게시판 댓글 리스트 조회 
 * @param: 
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApi.prototype.postCm = function(pPostNo, pPageNo, pRowCount, pLoading){
	var postNo = pPostNo;
	var pageNo = pPageNo;
    var loadingYn = pLoading;
    var rowCount = pRowCount;
	
	if(isNull(postNo)) postNo = null;
    if(isNull(pageNo)) pageNo = 1;
    if(isNull(rowCount)) pageNo = 5;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/additional/board/cm', 
	{
		//post는 data사용 
		params: {
			pPostNo: postNo,
            pPageNo: pageNo,
            pRowCount: rowCount
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 게시판 댓글 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BoardApi.prototype.postCmInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/additional/board/cm', entry);
}


/********************************************************************************************
 * 게시판 댓글 삭제(논리 삭제)
 * @param: 댓글 삭제 객체 
 * @return: 처리건수
 ********************************************************************************************/
BoardApi.prototype.postCmDelete = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/additional/board/cm', {
		params: {
			pPostNo: pEntry.POST_NO,
			pCmSeq: pEntry.CM_SEQ,
    	},
    	loading: loadingYn
	});
}

/********************************************************************************************
 * 게시판 댓글 삭제(물리 삭제)
 * @param: 댓글 삭제 객체 
 * @return: 처리건수
 ********************************************************************************************/
BoardApi.prototype.postCmRemove = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/additional/board/cm/remove', {
		params: {
			pPostNo: pEntry.POST_NO,
			pCmSeq: pEntry.CM_SEQ,
    	},
    	loading: loadingYn
	});
}

/********************************************************************************************
 * 좋아요 등록 체크
 * @param: 조회 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BoardApi.prototype.answerPostList = function(pParam, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/additional/board/answer',
		{
			params: pParam,
			loading: loadingYn
		});
}

/********************************************************************************************
 * 좋아요 등록 체크
 * @param: 조회 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BoardApi.prototype.checkPostLike = function(pParam, pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/additional/board/like',
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
BoardApi.prototype.postLikeInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.post('/additional/board/like', entry);
}

/********************************************************************************************
 * 좋아요 삭제
 * @param: 좋아요 삭제 객체
 * @return: 처리건수
 ********************************************************************************************/
BoardApi.prototype.postLikeDelete = function (paramObj, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/additional/board/like',{
		params : paramObj,
		loading : loadingYn
	});
}

/********************************************************************************************
 * 게시판 좋아요 카운트 업데이트
 * @param: 수정 할 정보(json object), 양수(true)/음수(false)
 * @return: 처리건수
 ********************************************************************************************/
BoardApi.prototype.boardPostUpdateLikeCount = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.put('/additional/board/like', entry);
}

/********************************************************************************************
 * 게시판 권한 관리 - 게시판 목록 조회 
 * @param: 게시판 구분, 게시판 명
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApi.prototype.boardAuth = function(entry, pPageNo, pRowCount, pLoading){
	var boardGb 	= entry.BOARD_GB;
	var searchArgv 	= entry.TITLE;
    var pageNo 		= pPageNo;
    var rowCount 	= pRowCount;
	var loadingYn 	= pLoading;
	
	if(isNull(boardGb)) 	boardGb 	= '';
	if(isNull(searchArgv)) 	searchArgv 	= '';
	if(isNull(pageNo)) 		pageNo 		= 1;
	if(isNull(rowCount)) 	rowCount 	= 5;
	if(isNull(loadingYn)) 	loadingYn 	= false;
	
	return axios.get('/additional/board/auth', 
	{
		//post는 data사용 
		params: {
			pBoardGb : boardGb,
			pSearchArgv: searchArgv,
            pPageNo: pageNo,
            pRowCount: rowCount
    	},
    	loading: loadingYn
    });
};

/********************************************************************************************
 * 게시판 권한 관리 - 게시판 구분별 권한 목록 조회
 * @param: 게시판 순번, 게시판 권한 구분
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApi.prototype.boardAuthGb = function(entry, pPageNo, pRowCount, pLoading){
	var boardSeq 	= entry.BOARD_SEQ;
	var boardAuthGb = entry.BOARD_AUTH_GB;
    var pageNo 		= pPageNo;
    var rowCount 	= pRowCount;
	var loadingYn 	= pLoading;
	
	if(isNull(boardSeq)) 	boardSeq 	= '';
	if(isNull(boardAuthGb)) boardAuthGb = '';
	if(isNull(pageNo)) 		pageNo 		= 1;
	if(isNull(rowCount)) 	rowCount 	= 5;
	if(isNull(loadingYn)) 	loadingYn 	= false;
	
	return axios.get('/additional/board/auth-gb', 
	{
		//post는 data사용 
		params: {
			pBoardSeq : boardSeq,
			pBoardAuthGb: boardAuthGb,
            pPageNo: pageNo,
            pRowCount: rowCount
    	},
    	loading: loadingYn
    });
};



/********************************************************************************************
 * 게시판 권한 관리 - 게시판 구분별 권한 추가
 * @param: 게시판 순번, 게시판 권한 구분, 권한 코드
 * @return: 처리 건수
 ********************************************************************************************/
BoardApi.prototype.authCdInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/additional/board/auth-gb', entry);
};

/********************************************************************************************
 * 게시판 권한 관리 - 게시판 구분별 권한 삭제
 * @param: 게시판 순번, 게시판 권한 구분, 권한 코드
 * @return: 처리 건수
 ********************************************************************************************/
BoardApi.prototype.authCdDelete = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;

	return axios.delete('/additional/board/auth-gb', {
		params: {
			pBoardSeq: pEntry.pBoardSeq,
			pBoardAuthGb: pEntry.pBoardAuthGb,
			pAuthCd: pEntry.pAuthCd,
    	},
    	loading: loadingYn
	});
};


/********************************************************************************************
 * 게시판에 부여된 권한 조회 
 * @param: 게시판 순번, 컨트롤러에서의 사용자 세션 권한
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApi.prototype.authInfo = function(pBoardSeq, pLoading){
	var loadingYn = pLoading;
	
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/additional/board/auth-gb/' + pBoardSeq,
	{
		//post는 data사용 
		params: {
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 기관 관리 조회
 * @param: 검색구분
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApi.prototype.totSearch = function(paramObj, pLoading) {
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/additional/board/totSearch', {
		//post는 data사용
		params: paramObj,
		loading: loadingYn
	});
};

/********************************************************************************************
 * 게시판 슈퍼관리자 권한 조회
 * @param: 검색구분
 * @return: 조회 리스트
 ********************************************************************************************/
BoardApi.prototype.setSuperAdminYn = function(pBoardSeq, pLoading){
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;

	return axios.get('/additional/board/super-auth',
	{
		//post는 data사용 
		params: {
			BOARD_SEQ: pBoardSeq
		},
		loading: loadingYn
	});
}
