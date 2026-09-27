function BannerApi(){}
var bannerApi = new BannerApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * 배너 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
BannerApi.prototype.banner = function(pSearchType, pSearchArgv, pPageNo, pRowCnt, pMenuGb, pMngYn, pLoading){
	var searchType = pSearchType;
	var searchArgv = pSearchArgv;
	var pageNo = pPageNo;
	var rowCnt = pRowCnt;
	var menuGb = pMenuGb;
	var mngYn = pMngYn;
	var loadingYn = pLoading;
	
	if(isNull(searchArgv)) searchArgv = '';
	if(isNull(searchType)){
		searchType = '';
		searchArgv = '';
	}
	if(isNull(pageNo)) pageNo = 1;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/additional/banner', 
	{
		//post는 data사용 
		params: {
			pSearchType: searchType,
			pSearchArgv: searchArgv,
			pPageNo: pageNo,
			pMenuGb : menuGb,
			pRowCnt: rowCnt,
			pMngYn: mngYn,
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 배너  추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BannerApi.prototype.bannerInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/additional/banner', entry);
}

/********************************************************************************************
 * 배너  수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BannerApi.prototype.bannerUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/additional/banner', entry);
}

/********************************************************************************************
 * 배너  삭제
 * @param: 배너코드
 * @return: 처리건수
 ********************************************************************************************/
BannerApi.prototype.bannerDelete = function(pBannerSeq, pLoading){
	var bannerSeq = pBannerSeq;
	var loadingYn = pLoading;
	
	if(isNull(bannerSeq)) bannerSeq = '';
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.delete('/additional/banner/'+pBannerSeq);
}


/********************************************************************************************
 * 배너 그룹 리스트 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
BannerApi.prototype.bannerGroup = function(pSearchType, pSearchArgv, pPageNo, pRowCnt, pLoading){
	var searchType = pSearchType;
	var searchArgv = pSearchArgv;
	var pageNo = pPageNo;
	var rowCnt = pRowCnt;
	var loadingYn = pLoading;
	
	if(isNull(searchArgv)) searchArgv = '';
	if(isNull(searchType)){
		searchType = '';
		searchArgv = '';
	}
	if(isNull(pageNo)) pageNo = 1;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/additional/banner/group', 
	{
		//post는 data사용 
		params: {
			pSearchType: searchType,
			pSearchArgv: encodeURI(searchArgv),
			pPageNo: pageNo,
			pRowCnt: rowCnt
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 배너 그룹 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BannerApi.prototype.bannerGroupInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/additional/banner/group', entry);
}

/********************************************************************************************
 * 배너 그룹 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BannerApi.prototype.bannerGroupUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/additional/banner/group', entry);
}

/********************************************************************************************
 * 배너 그룹 삭제
 * @param: 배너코드
 * @return: 처리건수
 ********************************************************************************************/
BannerApi.prototype.bannerGroupDelete = function(pBannerSeq, pLoading){
	var bannerSeq = pBannerSeq;
	var loadingYn = pLoading;
	
	if(isNull(bannerSeq)) bannerSeq = '';
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.delete('/additional/banner/group/'+pBannerSeq);
}

/********************************************************************************************
 * 배너 그룹 전체 리스트
 * @param: 배너코드
 * @return: 처리건수
 ********************************************************************************************/
BannerApi.prototype.bannerTotalGroup = function(pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/additional/banner/group', 
	{
		//post는 data사용 
		params: {
			pSearchType: '',
			pSearchArgv: ''
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 배너 개시 전체 리스트
 * @param: 배너코드
 * @return: 처리건수
 ********************************************************************************************/
BannerApi.prototype.bannerTotalPost = function(pBannerGroupSeq, pLoading){
	var bannerGroupSeq = pBannerGroupSeq;
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/additional/banner/total-post/', 
	{
		params: {
			pBannerGroupSeq: bannerGroupSeq
    	},
    	loading: loadingYn
    });
	
}

/********************************************************************************************
 * 배너 전체 리스트
 * @param: 배너코드
 * @return: 처리건수
 ********************************************************************************************/
BannerApi.prototype.bannerTotal = function(pLoading){
	var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/additional/banner', 
	{
		//post는 data사용 
		params: {
			pSearchType: '',
			pSearchArgv: ''
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 배너 개시 추가
 * @param: 배너코드
 * @return: 처리건수
 ********************************************************************************************/
BannerApi.prototype.bannerPostInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/additional/banner/post', entry);
}

/********************************************************************************************
 * 배너 개시 순번 수정
 * @param: 배너코드
 * @return: 처리건수
 ********************************************************************************************/
BannerApi.prototype.bannerPostOrdUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/additional/banner/post-ord', entry);
}


/********************************************************************************************
 * 배너 개시 순번 수정
 * @param: 배너코드
 * @return: 처리건수
 ********************************************************************************************/
BannerApi.prototype.bannerPostDelete = function(pBannerGroupSeq, pBannerSeq, pPostSeq, pLoading){
	var bannerGroupSeq = pBannerGroupSeq;
	var bannerSeq = pBannerSeq;
	var postSeq = pPostSeq;
	
	var loadingYn = pLoading;

	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.delete('/additional/banner/post', 
	{
		params: {
			pBannerGroupSeq: bannerGroupSeq,
			pBannerSeq: bannerSeq,
			pPostSeq: postSeq
    	},
    	loading: loadingYn
    });
}

/********************************************************************************************
 * 배너 그룹 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
BannerApi.prototype.bannerPostUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/additional/banner/post', entry);
}

