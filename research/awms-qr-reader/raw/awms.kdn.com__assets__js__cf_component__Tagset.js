/********************************************************************************************
 *                                                                                          *                  
 *                                   Tagset Component                                       *
 *                                                                                          * 
 * 작성자   : 박해수                                                                        *
 * 작성일   : 2019.01.31                                                                    *
 * ******************************************************************************************
 * 수정내역 :                                                                                
 *   - 2019.01.31 : 신규작성
 *   - 
 *   -  
 ********************************************************************************************/

/********************************************************************************************
 * 기능목록
 * ** Method  **                                                                                
 * Tagset() : 데이타를 테이블 형태로 저장하는 오브젝트입니다. 
 * 
 * ** Property **
 ********************************************************************************************/



/********************************************************************************************
 * @Description
 * 	input Tag를 구성하기 위한 파일 오브젝트입니다.
 * 
 * @Syntax 
 *  new Tagset();
 *  // Create Object
 *  var tag = new Tagset();
 * 
 * @Parameters
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
var Tagset = function(){
	try{
		this.dataset = null;
		this.columnId = null;
		this.index = null;
		this.id = null;
		this.dedupe = false; 
		
		return this;
	}catch(err){
		console.log('new Tagset() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	input tag 객체에 데이터를 입력하며 초기 셋팅합니다.
 * 
 * @Syntax 
 * 	Tagset.init(pDataset, pColumnId, pIndex, pId);
 * 
 * @Parameters
 * pDataset(Dataset) : 태그의 값이 있는 Dataset
 * pColumnId(String) : 데이터 셋에서 태그항목의 컬럼 아이디
 * pIndex(String) : 현재 행 번호
 * pId(String) : dom에 설정 될 아이디
 * pDedupe(Boolean) : 중복제거 여부 (true일 경우에만 중복 입력 방지)
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
Tagset.prototype.init = function(pDataset, pColumnId, pIndex, pId, pDedupe){
	try{
		if(isNull(pIndex) || pIndex < 0) return;
		this.dataset = pDataset;
		this.columnId = pColumnId;
		this.index = pIndex;
		this.id = pId;
		
		if(isNull(this.dataset)){
			console.log('new Tagset() Error : dataset is required.');
			return false;
		}
		if(isNull(this.columnId)){
			console.log('new Tagset() Error : columnId is required.');
			return false;
		}
		if(isNull(this.index)){
			console.log('new Tagset() Error : index is required.');
			return false;
		}
		if(pDedupe == true) this.dedupe = true; 
		
		return true;
	}catch(err){
		console.log('Tagset.init() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	태그를 문자열로 반환 합니다.
 * 
 * @Syntax 
 * 	Tagset.getTag();
 * 
 * @Parameters
 * 
 * @return
 * 	tag(String) : 문자열로 나열 된 태그 리스트
 ********************************************************************************************/
Tagset.prototype.getTag = function(){
	try{
		if(!isNull(this.index)){
			var tag = this.dataset.getColumn(this.index, this.columnId);
			if(isNull(tag)) return tag
			else return tag.trim(); 
		}else{
			return false;
		}
	}catch(err){
		console.log('Tagset.getTag() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	태그를 재정의 합니다.
 * 
 * @Syntax 
 * 	Tagset.setTag(pTag);
 * 
 * @Parameters
 *  pTag(String) : 새롭게 정의 할 태그 문자열
 *  
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
Tagset.prototype.setTag = function(pTag){
	try{
		var trimTag = pTag.trim();
		this.dataset.setColumn(this.index, this.columnId, trimTag);
		return true;
	}catch(err){
		console.log('Tagset.setTag() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	콤마로 구분되어있는 태그를 콤마 기준 배열로 반환 합니다.
 * 
 * @Syntax 
 * 	Tagset.tagToList();
 * 
 * @Parameters
 * 
 * @return
 * 	tagList(ArrayList) : 배열로 변환 된 태그리스트 반환
 ********************************************************************************************/
Tagset.prototype.tagToList = function(){
	try{
		var tag = this.getTag();
		if(tag){
			var tagList = tag.split(',');
			
			if(this.dedupe == true){
				tagList = _.uniq(tagList);
			}
			
			if(!isNull(tag) && tag.length > 0){
				return tagList;
			}else{
				return '';
			}
		}else{
			false;
		}
	}catch(err){
		console.log('Tagset.tagToList() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	input tag 항목을 삭제합니다.
 * 
 * @Syntax 
 * 	Tagset.removeTag(pTag);
 * 
 * @Parameters
 * pTag(String) : 삭제할 태그
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
Tagset.prototype.removeTag = function(pTag){
	try{
  		var tagsLength = this.tagToList().length;
  		var tag = this.getTag();
  		var replaceTag = pTag;
  		
  		if(tag.indexOf(pTag) > 0){
  			replaceTag = ','+replaceTag;
  		}else if(tag.indexOf(pTag) == 0 && tagsLength > 1){
  			replaceTag = replaceTag+',';
  		}
  		
  		this.setTag(tag.replace(replaceTag, ''));
		return true;
	}catch(err){
		console.log('Tagset.removeTag() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	input tag 항목을 추가합니다.
 * 
 * @Syntax 
 * 	Tagset.insertTag(pTag, pTarget);
 * 
 * @Parameters
 * pTag(String) : insert할 태그
 * target(Object) : 태그를 입력하는 input text Object
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
Tagset.prototype.insertTag = function(pTag, pTarget){
	try{
  		if(!isNull(pTag)){
  			var inputTag = nullToEmpty(pTag.trim());
  			var tag = nullToEmpty(this.getTag());
  			
  			if(!isNull(tag)){
  				var tagSplit = tag.split(',');
  				var findRowPosition = _.indexOf(tagSplit, inputTag);
  				
  				if(findRowPosition > -1 && this.dedupe == true){
  					notifySubmit('warning', '태그 추가', '중복 된 항목이 존재합니다.', 'icon-caution');
  					return;
  				}else{
  					tag = tag.trim();
  	      			inputTag = ','+inputTag;
  				}
      		}
      		this.setTag(tag+inputTag);
  		}
  		
  		pTarget.value = '';
  		pTarget.focus();
		return true;
	}catch(err){
		console.log('Tagset.insertTag() Error : '+err.message);
		return false;
	}	
}


