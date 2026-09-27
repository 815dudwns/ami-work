/********************************************************************************************
 *                                                                                          *                  
 *                                   CommcodeSet Component                                  *
 *                                                                                          * 
 * 작성자   : 박해수                                                                        *
 * 작성일   : 2019.01.29                                                                    *
 * ******************************************************************************************
 * 수정내역 :                                                                                
 *   - 2019.01.29 : 신규작성
 *   - 
 *   -  
 ********************************************************************************************/

/********************************************************************************************
 * 기능목록
 * ** Method  **                                                                                
 * CommcodeSet() : 공통코드를 가지고 오는 오브젝트 입니다.
 * 
 * ** Property **
 ********************************************************************************************/

/********************************************************************************************
 * @Description
 * 	공통코드를 가지고 오는 오브젝트 입니다.
 * 	
 *  @Syntax 
 * 	new CommcodeSet();
 *  // Create Object
 *  var ds = new CommcodeSet;
 * 
 * @Parameters
 * 	pServiceCd(String) : 서비스코드
 * 
 * @return
 * 	성공여부를 반환합니다.(Boolean)
 ********************************************************************************************/
var CommcodeSet = function(pServiceCd, init){
	try{
		if(isNull(pServiceCd)){
			console.log('new CommcodeSet() Error : serviceCd is required.');
			return false;
		}
		
		this.data = [];
		this.serviceCd = pServiceCd; 
		
		if(init){
			this.init();
		}
		return true;
	}catch(err){
		console.log('new CommcodeSet Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 * 	가져온 공통코드에서 상위코드에 해당하는 코드를 리턴합니다.
 * 
 * @Syntax 
 * 	CommcodeSet.getCommcode(pServiceCd, pUpCd, pFirstRow, pColumn, pInputLmtYn)
 * 
 * @Parameters
 * 	pServiceCd(String) : 서비스코드
 *  pUpCd(String) : 상위코드
 *  pFirstRow(String) : 첫로우 타입 all, select, null (default : null)
 *  pColumn(String) : 어떤 컬럼을 가져올 것인지 CD, CD1 ~ CD10 (default : CD)
 *  pInputLmtYn(String) : 신규입력제한여부 Y,N (신규입력이 제한 되어있는것만 가지고 올것인지 아닌지)
 *  pAddColumnList(Object) : 추가로 가져올 컬럼 종류
 * 
 * @return
 * 	[{CD, CD_NM}]
 ********************************************************************************************/
CommcodeSet.prototype.init = function(){
	try{
		var self = this;
		var returnData = null;
		
		if(isNull(this.serviceCd)){
			console.log('new CommcodeSet() Error : serviceCd is required.');
			return false;
		}
		
		returnData = axios.get('/comm/'+this.serviceCd.toLowerCase()+'/codes', 
		{
			//post는 data사용 
			params: {
				SERVICE_CD: this.serviceCd.toUpperCase(),
				service: this.serviceCd.toLowerCase()
	    	},
	    	loading: false
	    }).then(function(response) {
	    	self.data = response.data;
			return true;
		}).catch(function(error) {
			console.error('error:', error);
			return false;
		});
	}catch(err){
		console.log('CommcodeSet.init() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 * 	가져온 공통코드에서 상위코드에 해당하는 코드를 리턴합니다.
 * 
 * @Syntax 
 * 	CommcodeSet.getCommcode(pServiceCd, pUpCd, pFirstRow, pColumn, pInputLmtYn)
 * 
 * @Parameters
 * 	pServiceCd(String) : 서비스코드
 *  pUpCd(String) : 상위코드
 *  pFirstRow(String) : 첫로우 타입 all, select, null (default : null)
 *  pColumn(String) : 어떤 컬럼을 가져올 것인지 CD, CD1 ~ CD10 (default : CD)
 *  pInputLmtYn(String) : 신규입력제한여부 Y,N (신규입력이 제한 되어있는것만 가지고 올것인지 아닌지)
 *  pAddColumnList(Object) : 추가로 가져올 컬럼 종류
 * 
 * @return
 * 	[{CD, CD_NM}]
 ********************************************************************************************/
CommcodeSet.prototype.getCommcode = function(pServiceCd, pUpCd, pFirstRow, pColumn, pInputLmtYn, pAddColumnList){
	try{
		var serviceCd = pServiceCd;
		var upCd = pUpCd;
		var firstRow = pFirstRow;
		var column = pColumn;
		var inputLmtYn = pInputLmtYn;
		var returnArray = [];
		var addColumnList = pAddColumnList;
		
		if(isNull(serviceCd)){
			console.log('new CommcodeSet() Error : serviceCd is required.');
			return false;
		}
		
		if(isNull(upCd)){
			console.log('new CommcodeSet() Error : upCd is required.');
			return false;
		}
		
		if(firstRow == 'all'){
			firstRow = '- 전체 -';
		}else if(firstRow == 'select'){
			firstRow = '- 선택 -';
		}else if(firstRow == 'blank'){
			firstRow = null;
		}else{
			firstRow = '- 전체 -';
		}
		
		if(isNull(column)){
			column = 'CD_NM';
		}
		
		if(isNull(inputLmtYn)){
			inputLmtYn = 'N';
		}
		
		if(isNull(addColumnList)){
			addColumnList = '';
		}
		
		returnArray = _.filter(this.data, {'SERVICE_CD':serviceCd, 'UP_CD':upCd, 'INPUT_LMT_YN':inputLmtYn});
		returnArray = _.map(returnArray, function(i){
			if(addColumnList == 'all'){
				return _.pick(i, 'CD', 'CD_NM', 'UP_CD', 'ORD', 'CD1', 'CD2', 'CD3', 'CD4', 'CD5', 'CD6', 'CD7', 'CD8', 'CD9', 'CD10', 'USE_YN');
			}else{
				return _.pick(i, 'CD', column, 'UP_CD', 'ORD', addColumnList);
			}
		});
		if(column != 'CD_NM') returnArray = _.rename(returnArray, column, 'CD_NM');
		returnArray = _.sortBy(returnArray, parseInt(['ORD'],10));
		
		if(!isNull(firstRow)){
			returnArray.splice(0, 0, {'CD':'', 'CD_NM':firstRow, 'UP_CD':'', 'ORD':-1});
		}
//		console.log(JSON.stringify(returnArray));
		return returnArray;
	}catch(err){
		console.log('Dataset.getCommcode() Error : '+err.message + '____{pServiceCd: '+pServiceCd+', pUpCd: '+pUpCd+'}');
		return false;
	}
}

/********************************************************************************************
 * @Description
 * 	공통코드의 key에 해당하는 정보를 받아 원하는 컬럼 값을 리턴합니다.
 * 
 * @Syntax 
 * 	CommcodeSet.getCommcodeNm(pServiceCd, pUpCd, pCd, pReturnColumnNm, pSearchColumnNm)
 * 
 * @Parameters
 * 	pServiceCd(String) : 서비스코드
 *  pUpCd(String) : 상위코드
 *  pCd(String) : 코드
 *  pReturnColumnNm(String) : 리턴받을 컬럼 아이디
 *  pSearchColumnNm(String) : 검색 할 컬럼 아이디
 * 
 * @return
 * 	value(String)
 ********************************************************************************************/
CommcodeSet.prototype.getCommcodeNm = function(pServiceCd, pUpCd, pCd, pReturnColumnNm, pSearchColumnNm){
	try{
		var serviceCd = pServiceCd;
		var upCd = pUpCd;
		var cd = pCd;
		var returnColumnNm= pReturnColumnNm;
		var searchColumnNm= pSearchColumnNm;
		
		var returnArray = [];
		
		if(isNull(serviceCd)){
			console.log('new CommcodeSet() Error : serviceCd is required.');
			return false;
		}
		
		if(isNull(upCd)){
			console.log('new CommcodeSet() Error : upCd is required.');
			return false;
		}
		
		if(isNull(cd)){
			console.log('new CommcodeSet() Error : cd is required.');
			return false;
		}
		
		if(isNull(returnColumnNm)){
			returnColumnNm = 'CD_NM';
		}
		
		if(!isNull(searchColumnNm)){
			returnArray = _.filter(this.data, {'SERVICE_CD':serviceCd, 'UP_CD':upCd});
			returnArray = _.filter(returnArray, function(n){
				return n[pSearchColumnNm] == cd; 
			});
		}else{
			returnArray = _.filter(this.data, {'SERVICE_CD':serviceCd, 'UP_CD':upCd, 'CD':cd});
		}
		
		returnArray = _.map(returnArray, function(i){
			return _.pick(i, returnColumnNm);
		});
		if(returnColumnNm != 'CD_NM') returnArray = _.rename(returnArray, returnColumnNm, 'CD_NM');
		
		if(returnArray.length == 0){
			console.log('commcode not found..['+pUpCd+']');
		}else if(returnArray.length > 1){
			console.log('on duplicate key..');
		}else{
			returnArray = returnArray[0].CD_NM;
		}
		
		if(returnArray == false) returnArray = '';
		
		return returnArray;
	}catch(err){
		console.log('Dataset.getCommcodeNm() Error : '+err.message);
		return false;
	}
}