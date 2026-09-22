function RepresentativeApi(){}
var representativeApi = new RepresentativeApi(); // => 함수로 객체를 생성

/********************************************************************************************
 * 대표정보관리 리스트 조회 
 * @param: 사이트 순번
 * @return: 조회 리스트
 ********************************************************************************************/
RepresentativeApi.prototype.representativeService = function(pSiteSeq, pLoading){
	var siteSeq = pSiteSeq;
	var loadingYn = pLoading;
	
	if(isNull(siteSeq)) siteSeq = '';
	
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.get('/system-manager/represent-ative', 
	{
		//post는 data사용 
		params: {
			pSiteSeq: siteSeq
    	},
    	loading: loadingYn
	});
}
/********************************************************************************************
 * 대표정보관리 임기기간 중복체크 조회 
 * @param: 사이트순번, 대표자 구분, 시작날짜, 종료날짜
 * @return: 
 ********************************************************************************************/
RepresentativeApi.prototype.representativeCheck = function(pSiteSeq, pDaepyojaGb, pFrDt, pToDt){
	var siteSeq = pSiteSeq;
	var daepyojaGb = pDaepyojaGb;
	var frdt = pFrDt;
	var todt = pToDt;
	
	
	return axios.get('/system-manager/represent-ative/check', 
	{
		params :{
			pSiteSeq : siteSeq,
			pDaepyojaGb : daepyojaGb,
			pFrdt : frdt,
			pTodt : todt
		}
	});
}

/********************************************************************************************
 * 대표정보관리 추가
 * @param: 등록 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
RepresentativeApi.prototype.representativeInsert = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.post('/system-manager/represent-ative', entry);
}

/********************************************************************************************
 * 대표정보관리 수정
 * @param: 수정 할 정보(json object)
 * @return: 처리건수
 ********************************************************************************************/
RepresentativeApi.prototype.representativeUpdate = function(pEntry, pLoading){
	var entry = pEntry;
	var loadingYn = pLoading;
	
	if(isNull(entry)) entry = {};
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.put('/system-manager/represent-ative', entry);
}

/********************************************************************************************
 * 대표정보관리  삭제
 * @param: param(사이트 순번, 대표자 구분, 대표자 번호)
 * @return: 처리건수
 ********************************************************************************************/
RepresentativeApi.prototype.defaultinfoDelete = function(pSiteSeq, pDaepyojaGb, pDaepyojaSeq, pLoading){
	var siteSeq = pSiteSeq;
	var daepyojaGb = pDaepyojaGb;
	var daepyojaSeq = pDaepyojaSeq;
	
	var loadingYn = pLoading;

	if(isNull(siteSeq)) siteSeq = '';
	if(isNull(daepyojaGb)) daepyojaGb = '';
	if(isNull(daepyojaSeq)) daepyojaSeq = '';
	
	if(isNull(loadingYn)) loadingYn = false;
	
	return axios.delete('/system-manager/represent-ative', 
	{
		params : {
					  pSiteSeq: siteSeq
					, pDaepyojaGb : daepyojaGb
					, pDaepyojaSeq : daepyojaSeq
    	},
    	loading: loadingYn
	});
}