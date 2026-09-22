function MobMtl1000Api(){}
var mobMtl1000Api = new MobMtl1000Api();

/********************************************************************************************
 * 검색조건 조회 
 * @param: 
 * @return: 검색조건 리스트
 ********************************************************************************************/
MobMtl1000Api.prototype.getOptions = function(params, loading){
	return axios.get('/ami/mob/mtl/mobMtl1000/selectOption'	, {
		params: params,
		loading: false
	});
}

/********************************************************************************************
 * 바코드, QR
 * @param: 바코드 or QR코드
 * @return: count
 ********************************************************************************************/
MobMtl1000Api.prototype.getBarcdQrInfo = function(params, loading){
	return axios.get('/ami/mob/mtl/mobMtl1000/selectBarcdQr', {
		params: params,
		loading: true
	});
}

/********************************************************************************************
 * 등록 
 * @param: 조회된 항목들
 * @return: count
 ********************************************************************************************/
MobMtl1000Api.prototype.insMtrl = function(params, loading){
	return axios.post('/ami/mob/mtl/mobMtl1000/insertMtrl', params, {
			loading: true
	});
}