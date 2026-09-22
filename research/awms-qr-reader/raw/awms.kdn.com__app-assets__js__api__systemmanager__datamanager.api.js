function DataManagerApi(){}
var dataManagerApi = new DataManagerApi(); // => 함수로 객체를 생성
/********************************************************************************************
 * DB정보 조회 
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
DataManagerApi.prototype.dbInfo = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/data-manager/db-info', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * MAIN DB, TABLE LIST 조회
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
DataManagerApi.prototype.mainTableList = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/data-manager/main-table-list', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * SUB DB, TABLE LIST 조회
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
DataManagerApi.prototype.subTableList = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/data-manager/sub-table-list', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * MAIN DB, TABLE LIST 조회
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
DataManagerApi.prototype.mainDataList = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/data-manager/main-data-list', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * SUB DB, TABLE LIST 조회
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
DataManagerApi.prototype.subDataList = function(pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.get('/system-manager/data-manager/sub-data-list', 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * MAIN DB, INSERT
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
DataManagerApi.prototype.mainDbInsert = function(pData, pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.put('/system-manager/data-manager/main-db-insert', pData,
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}

/********************************************************************************************
 * SUB DB, INSERT
 * @param: 검색구분, 검색어
 * @return: 조회 리스트
 ********************************************************************************************/
DataManagerApi.prototype.subDbInsert = function(pData, pParam, pLoading){
    var loadingYn = pLoading;
	if(isNull(loadingYn)) loadingYn = false;
    
	return axios.put('/system-manager/data-manager/sub-db-insert', pData, 
	{
		params: eval(pParam),
    	loading: loadingYn
    });
}