/********************************************************************************************
 *                                                                                          *                  
 *                                   CustomcodeSet Component                                  *
 *                                                                                          * 
 * 작성자   : 박해수                                                                        *
 * 작성일   : 2019.02.09                                                                    *
 * ******************************************************************************************
 * 수정내역 :                                                                                
 *   - 2019.02.09 : 신규작성
 *   - 
 *   -  
 ********************************************************************************************/

/********************************************************************************************
 * 기능목록
 * ** Method  **                                                                                
 * CustomcodeSet() : 커스텀코드를 가지고 오는 오브젝트 입니다.
 * 
 * ** Property **
 ********************************************************************************************/

/********************************************************************************************
 * @Description
 * 	커스텀코드를 가지고 오는 오브젝트 입니다.
 * 
 * @Syntax 
 * 	new CustomcodeSet(pUrl, pParam);
 *  // Create Object
 *  var cd = new CustomcodeSet(pUrl, pParam);
 * 
 * @Parameters
 * 	pUrl(String) : 코드를 가지고 올 REST API 주소
 *  pParam(Object) : API호출 시 필요한 조건 Object 
 * 
 * @return
 ********************************************************************************************/
var CustomcodeSet = function(pUrl, pParam){
	this.data = [];
	this.url = pUrl;
	var returnData = null;
	var self = this;
	var paramObj = new Object();
	
	try{
		if(isNull(pUrl)){
			console.log('new CustomcodeSet() Error : URL is required.');
			return false;
		}
		if(isNull(pParam)){
			paramObj = {};
		}else{
			paramObj = pParam;
		}
		
		returnData = this.data = axios.get(pUrl, 
		{
			//post는 data사용 
			params: eval(paramObj),
	    	loading: false
	    }).then(function(response) {
	    	self.data = response.data;
	    	return true;
	    }).catch(function(error) {
			console.error('error:', error);
			return false;
		});
	}catch(err){
		console.log('new CustomcodeSet() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 * 	가져온 커스텀코드에서 상위코드에 해당하는 코드를 리턴합니다.
 * 
 * @Syntax 
 * 	CustomcodeSet.getCommcode(pServiceCd, pUpCd, pFirstRow)
 * 
 * @Parameters
 * 	pCd(String) : CD(코드)로 가져올 컬럼 명
 *  pCdNm(String) : CD_NM(코드 명)으로 가져올 컬럼 명
 *  pFirstRow(String) : 첫로우 타입 all, select, null (default : null)
 * 
 * @return
 * 	[{CD, CD_NM}]
 ********************************************************************************************/
CustomcodeSet.prototype.getCustomcode = function(pCd, pCdNm, pFirstRow, pAddColumnList){
	try{
		var cd = pCd;
		var cdNm = pCdNm;
		var firstRow = pFirstRow;
		var returnArray = [];
		var addColumnList = pAddColumnList;
		
		if(isNull(cd)){
			console.log('getCustomcode() Error : CD is required.');
			return false;
		}
		if(isNull(cdNm)){
			console.log('getCustomcode() Error : CD_NM is required.');
			return false;
		}
		
		
		if(isNull(firstRow)){
			firstRow = '';
		}else if(firstRow == 'all'){
			firstRow = '- 전체 -';
		}else if(firstRow == 'select'){
			firstRow = '- 선택 -';
		}else{
			firstRow = '- 전체 -';
		}
		if(isNull(addColumnList)){
			addColumnList = '';
		}
		
//		returnArray = _.filter(this.data, {'SERVICE_CD':serviceCd, 'UP_CD':upCd, 'INPUT_LMT_YN':inputLmtYn});
//		returnArray = _.map(this.data, i => _.pick(i, cd, cdNm))
		returnArray = _.map(this.data, function(i){
			return _.pick(i, cd, cdNm, addColumnList);
		});
		if(cd != 'CD') returnArray = _.rename(returnArray, cd, 'CD');
		if(cdNm != 'CD_NM') returnArray = _.rename(returnArray, cdNm, 'CD_NM');
//		_.sortBy(returnArray, ['ORD']);
		
		if(!isNull(firstRow)){
			returnArray.splice(0, 0, {'CD':'', 'CD_NM':firstRow});
		}
//		console.log(JSON.stringify(returnArray));
		return returnArray;
	}catch(err){
		console.log('Dataset.getCustomcode() Error : '+err.message + '____{pUrl: '+this.url+', pCd: '+pCd+'}');
		return false;
	}
}

/********************************************************************************************
 * @Description
 * 	커스텀코드의 key에 해당하는 정보를 받아 원하는 컬럼 값을 리턴한다.
 * 
 * @Syntax 
 * 	CustomcodeSet.getCustomcodeNm(pCd, pFindValue, pReturnColumnNm)
 * 
 * @Parameters
 * 	pCd(String) : 검색할 컬럼명
 *  pFindValue(String) : 검색할 컬럼값
 *  pReturnColumnNm(String) : 리턴할 컬럼명
 * 
 * @return
 * 	value(String)
 ********************************************************************************************/
CustomcodeSet.prototype.getCustomcodeNm = function(pCd, pFindValue, pReturnColumnNm){
	try{
		var cd = pCd;
		var findValue = pFindValue;
		var returnColumnNm= pReturnColumnNm;
		var returnArray = [];
		
		if(isNull(cd)){
			console.log('new CustomcodeSet() Error : cd is required.');
			return false;
		}
		
		if(isNull(findValue)){
			console.log('new CustomcodeSet() Error : findValue is required.');
			return false;
		}
		
		if(isNull(returnColumnNm)){
			returnColumnNm = 'CD_NM';
		}
		returnArray = _.filter(this.data, function(e){ /*console.log(e[pCd]+' == '+findValue);*/ return e[pCd] == findValue; });
//		returnArray = _.map(returnArray, i => _.pick(i, returnColumnNm));
		returnArray = _.map(returnArray, function(i){
			return _.pick(i, returnColumnNm);
		});
		
		if(returnColumnNm != 'CD_NM') returnArray = _.rename(returnArray, returnColumnNm, 'CD_NM');
		if(returnArray.length == 0){
			console.log('customCode not found..['+pCd+']');
		}else if(returnArray.length > 1){
			console.log('on duplicate key..');
		}else{
			returnArray = returnArray[0].CD_NM;
		}
		return returnArray;
	}catch(err){
		console.log('Dataset.getCustomcodeNm() Error : '+err.message);
		return false;
	}
}