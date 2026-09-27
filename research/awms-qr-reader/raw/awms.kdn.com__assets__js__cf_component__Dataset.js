/********************************************************************************************
 *                                                                                          *                  
 *                                   Dataset Component                                      *
 *                                                                                          * 
 * 작성자   : 박해수                                                                        *
 * 작성일   : 2019.01.18                                                                    *
 * ******************************************************************************************
 * 수정내역 :                                                                                
 *   - 2019.01.18 : 신규작성
 *   - 
 *   -  
 ********************************************************************************************/

const ROWTYPE_EMPTY = 0;
const ROWTYPE_NORMAL = 1;
const ROWTYPE_INSERT = 2;
const ROWTYPE_UPDATE = 4;
const ROWTYPE_DELETE = 8;
const ROWTYPE_GROUP = 16;

/********************************************************************************************
 * @Description
 * 	데이타를 테이블 형태로 저장하는 오브젝트입니다.
 * 
 * @Syntax 
 * 	new Dataset();
 *  var ds = new Dataset;
 * 
 * @Parameters
 * 
 * @return
 * 	Dataset()
 ********************************************************************************************/
var Dataset = function(pVm){
	try{
		this.data = []; //기본 데이터
		this.treeData = []; //기본 데이터
		this.treeNormalData = []; //기본 데이터
		this.beforeData = []; //수정 직전 데이터
		this.defaultData = []; //최초 조회시 데이터(setData)
		this.rowposition = -1; //현재 행
		this.currentRow = null; //현재 로우
		this.enableevent = true; //이벤트 발생여부
		this.rawData = []; //frontend 자체적으로 페이징 될 경우 데이터를 담아오는 곳
		this.vm = pVm;
		
		return this;
	}catch(err){
		console.log('new Dataset() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	데이터셋의 조회 된 자료를 로드하는 메소드 입니다.
 *  트리 템플릿에 데이터셋을 사용할 때에는 Dataset.setData()사용 시 두번째 파라메터(데이터셋 구분)에 "tree"를
 *  명시해야 합니다. 그리고 트리는 기본적으로 CD, UP_CD, LV, ORD 컬럼이 존재해야 구성될 수 있습니다.
 * 
 * @Syntax 
 * 	Dataset.setData(pData:JsonArray, pDatasetGb:String, pMenuCdLength:String)
 * 
 * @Parameters
 * 	pData(JsonArray) : 데이터셋에 입력 될 데이터 입니다.
 * 	pDatasetGb(JsonArray) : 일반 데이터셋 구성인지, 트리용 데이터셋 구성인지 구분 합니다. [normal, tree]
 *  pMenuCdLength(String) : 최상위 행의 메뉴 코드 길이 값 입니다.
 * 
 * @return
 * 	성공여부를 반환합니다.(Boolean)
 ********************************************************************************************/
Dataset.prototype.setData = function(pData, pDatasetGb, pMenuCdLength){
	try{
		this.clear();
		
		if(isNull(pData)) pData = [];
		if(JSON.stringify(pData).indexOf('[') != 0){
			pData = [pData];
		}
		
		if(pData.length > 0){
			for(var i in pData) {
				var row = pData[i];
				var obj = {};
				var rowkeys = Object.keys(row);
				
				if(rowkeys.length > 0){
					for(var j=0 ; j < rowkeys.length ; j++){
						obj[rowkeys[j]] = row[rowkeys[j]];
					}
					
					//2019.02.27 박해수 : es6문법 제거
					/* 
					for(let key of Object.keys(row)){
						obj[key] = row[key];
					}
					*/
					
					if(Object.keys(obj).length > 0){
						obj['ROW_TYPE'] = ROWTYPE_NORMAL; //1: 초기행, 2: 신규, 3: 수정, 4: 삭제
						obj['FILTER_ROW'] = 'N'; //1: 초기행, 2: 신규, 3: 수정, 4: 삭제
						obj['DEFAULT_INDEX'] = i; //최초행 위치
						
						if(pDatasetGb == 'tree'){
							obj['OPEN'] = false;
							obj['TOGGLE'] = false;
						}
					}
					this.data.push(_.cloneDeep(obj));
					this.beforeData.push(_.cloneDeep(obj));
					this.defaultData.push(_.cloneDeep(obj));
				}
			}
		}
		
		if(pDatasetGb == 'tree'){
			this.treeData = this.treeDataChange(this.data, pMenuCdLength);
			
			return new Promise(function(resolve, reject){
				try{
					resolve(true);
				} catch (err){
					reject(false);
				}
			})
		}else{
			return true;
		}
	}catch(err){
		console.log('Dataset.setData() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 * 	데이터 셋을 트리콤포넌트에 맞게 재구성하는 메소드 입니다.
 * 
 * @Syntax 
 * 	Dataset.treeDataChange(pData:JsonArray, pMenuCdLength:String)
 * 
 * @Parameters
 * 	pData(JsonArray) : 데이터셋에 입력 된 데이터 입니다.
 *  pMenuCdLength(String) : 최상위 행의 메뉴 코드 길이 값 입니다.
 * 
 * @return
 * 	JsonArray(JsonArray) : 트리컴포넌트에 맞게 변경 된 데이터셋
 ********************************************************************************************/
Dataset.prototype.treeDataChange = function(pData, pMenuCdLength){
	try{
		if(!isNull(pData) && pData.length > 0){
			var lvMax = _.maxBy(pData, 'LV').LV;
			var lvMin = _.minBy(pData, 'LV').LV;
			var lvObj = {};
			
			for(var i=lvMin ; i <= lvMax ; i++){
				var lvTempEl = _.filter(pData, {'LV':i});
				lvTempEl = _.sortBy(lvTempEl, ['LV','ORD','CD']);
				/*
				_.forEach(lvTempEl, function(value) {
					_.assign(value,{'OPEN':false});
				});
				*/
				lvObj[i] = lvTempEl;
			}
			for(var i=lvMin ; i <= lvMax ; i++){
				if(i != 0){
					for(var j=0 ; j < lvObj[i].length ; j++){
						var obj = lvObj[i][j];
						var findIndex = _.findIndex(lvObj[i-1], {'CD':obj.UP_CD});
						
						if(findIndex > -1){
							if(!lvObj[i-1][findIndex].children){
								lvObj[i-1][findIndex]['children'] = [];
							}
							lvObj[i-1][findIndex].children.push(obj);
						}
					}
					//2019.02.27 박해수 : es6 문법 제거
					/*for(obj of lvObj[i]){
						var findIndex = _.findIndex(lvObj[i-1], {'CD':obj.UP_CD});
						
						if(findIndex > -1){
							if(!lvObj[i-1][findIndex].children){
								lvObj[i-1][findIndex]['children'] = [];
							}
							lvObj[i-1][findIndex].children.push(obj);
						}	
					}*/			
				}
			}
			this.treeNormalData = this.treeDataToNormal(_.cloneDeep(lvObj[0]), pMenuCdLength);
		}else{
			this.treeNormalData = this.treeDataToNormal(null, pMenuCdLength);
		}
		
		return lvObj[0];
	}catch(err){
		console.log('Dataset.treeDataChange() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 * 	트리콤포넌트에 맞게 가공 된 데이터의 children 구조를 풀어서 리턴한다. 
 * 
 * @Syntax 
 * 	Dataset.treeDataToNormal(pData:JsonArray, pMenuCdLength:String)
 * 
 * @Parameters
 * 	pData(JsonArray) : 데이터셋에 입력 된 데이터 입니다.
 *  pMenuCdLength(String) : 최상위 행의 메뉴 코드 길이 값 입니다.
 * 
 * @return
 * 	JsonArray(JsonArray) : 트리컴포넌트에 맞게 변경 된 데이터셋에서 children 항목을 풀어서 리턴
 ********************************************************************************************/
Dataset.prototype.treeDataToNormal = function(pData, pMenuCdLength){
	try{
		var returnData = [];
		var menuCd = "00000000";
		if(!isNull(pMenuCdLength)){
			menuCd = pad("0", pMenuCdLength);
		}
		returnData.push({'MENU_CD': menuCd,'MENU_NM':'- 최상위 -','MENU_LV':-1});
		
		if(!isNull(pData) && pData.length > 0){
			_.forEach(pData, function(obj, index){
				var children1 = _.cloneDeep(obj.children);
				
				delete obj['children'];
				returnData.push(obj);
				
				if(children1){
					_.forEach(children1, function(ob){
						var children2 = _.cloneDeep(ob.children);
						
						delete ob['children'];
						returnData.push(ob);
						
						if(children2){
							_.forEach(children2, function(o){
								var children3 = _.cloneDeep(o.children);
								
								delete o['children'];
								returnData.push(o);
								
								if(children3){
									_.forEach(children3, function(l){
										returnData.push(l);
									});
								}
							});
						}
					});
				}
			});
		}
		
		return returnData;
	}catch(err){
		console.log('Dataset.treeDataToNormal() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 * 	데이터셋에 입력 된 데이터 전체를 가져오는 메소드 입니다.
 * 
 * @Syntax 
 * 	Dataset.getData()
 * 
 * @Parameters 	
 * 
 * @return
 * 	JsonArray : 데이터 셋에 등록 된 데이터를 반환 합니다.
 *  오류 시 null반환
 ********************************************************************************************/
Dataset.prototype.getData = function(){
	try{
		return this.data;
	}catch(err){
		console.log('Dataset.getData() Error : '+err.message);
		return null
	}
}


/********************************************************************************************
 * @Description
 * 	데이터셋에 존재하는 모든 상태값 및 데이터를 초기화 합니다.(최초 데이터 셋팅 이전)
 * 
 * @Syntax 
 * 	Dataset.clear()
 * 
 * @Parameters 	
 * 
 * @return
 * 	성공여부를 반환합니다.(Boolean)
 ********************************************************************************************/
Dataset.prototype.clear = function(){
	try{
		this.data = [];
		this.treeData = [];
		this.beforeData = []; 
		this.defaultData = [];
		this.rowposition = -1;
		this.currentRow = null;
		this.enableevent = true;
		
		return true;
	}catch(err){
		console.log('Dataset.clear() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 * 	데이터셋의 마지막에 새로운 행(row)을 추가하는 메소드입니다.
 * 
 * @Syntax 
 * 	Dataset.addRow(pObjectList)
 *  Sample Call:
 *  var nRow = this.Dataset00.addRow(["COLID1","COLID2"]);
 * @Parameters
 *  pObjectList(Array) : 초기 셋팅 될 컬럼이름을 배열형태로 받아서 입력한다.
 * 
 * @return
 * 	Integer : 성공하면 새로 추가된 행의 위치값(zero-based)을 반환하고, 실패하면 -1을 반환합니다.
 ********************************************************************************************/
Dataset.prototype.addRow = function(pObjectList){
	try{
		var obj = {};
		
		if(JSON.stringify(this.data).indexOf('[') != 0){
			this.data = [];
		}
		
		obj['ROW_TYPE'] = ROWTYPE_INSERT; 
		obj['FILTER_ROW'] = 'N';
		
		if(!isNull(pObjectList)){
			var pObjectListKeys = Object.keys(pObjectList);
			
			for(var i=0 ; i < pObjectListKeys.length ; i++){
				var key = pObjectListKeys[i];
				
				if(key != 'ROW_TYPE' && key != 'FILTER_ROW'){
					obj[key] = _.cloneDeep(pObjectList[key]);
				}
			}
			//2019.02.27 박해수 : es6 문법제거
			/*
			for(let key of Object.keys(pObjectList)){
				if(key != 'ROW_TYPE' && key != 'FILTER_ROW'){
					obj[key] = _.cloneDeep(pObjectList[key]);
				}
			}
			*/
		}else if(this.data.length > 0){
			var dataKeys = Object.keys(this.data[0]);
			
			for(var i=0 ; i < dataKeys.length ; i++){
				var key = dataKeys[i];
				
				if(key != 'ROW_TYPE' && key != 'FILTER_ROW'){
					obj[key] = _.cloneDeep(this.data[key]);
				}
			}
			//2019.02.27 박해수 : es6 문법제거
			/*
			for(let key of Object.keys(this.data[0])){
				if(key != 'ROW_TYPE' && key != 'FILTER_ROW'){
					obj[key] = '';
				}
			}
			*/
		}
		
		this.rowposition = this.data.push(_.cloneDeep(obj))-1;
		this.beforeData.push(_.cloneDeep(obj));
		this.defaultData.push(_.cloneDeep(obj));
		this.setCurrentRow();
		
		return this.rowposition;
	}catch(err){
		console.log('Dataset.addRow() Error : '+err.message);
		return -1;
	}
}


/********************************************************************************************
 * @Description
 *  데이터셋에서 지정된 행(row)의 타입을 구하는 메소드입니다.
 * 
 * @Syntax 
 * 	Dataset.getRowType(nRow:Integer, sReturnType:String)
 * 
 * @Parameters
 * 	nRow(String) : 대상 행의 위치(zero-based 인덱스)
 * 	sReturnType(String) : 반환타입, class일 경우 아이콘 클래스를 리턴, null일 경우 타입(0,1,2,4,8) 반환
 *  
 *  Sample Call:
 *  var nRowType = this.Dataset00.getRowType(0);
 *  
 * @return
 * 	데이터셋에서 지정된 행의 타입을 반환합니다.
 *  만일 지정한 행이 존재하지 않으면 0(타입없음)을 반환합니다.
 ********************************************************************************************/
Dataset.prototype.getRowType = function(nRow, sReturnType){
	try{
		if(this.data[nRow] != undefined){
			var isEqual = this.dataCompare(nRow);
			var returnRowType = '';
			var currentRowType = this.data[nRow].ROW_TYPE;
			var returnClass = '';
			
			if(currentRowType == ROWTYPE_INSERT){
				returnRowType = currentRowType;
				returnClass = 'icon-add-dir';
			}else if(currentRowType == ROWTYPE_DELETE){
				returnRowType = currentRowType;
				returnClass = 'icon-trashcan';
			}else if(isEqual){
				returnRowType = ROWTYPE_NORMAL
				returnClass = '';
				if(currentRowType != ROWTYPE_NORMAL){}
			}else{
				returnRowType = ROWTYPE_UPDATE
				returnClass = 'icon-edit';
			}
			
			if(currentRowType != returnRowType){
				this.setRowType(nRow);
			}
			
			if(sReturnType == 'class') return returnClass;
			else return returnRowType;
		}else{
			return ROWTYPE_EMPTY;
		}
	}catch(err){
		console.log('Dataset.getRowType() Error : '+err.message);
		return ROWTYPE_EMPTY;
	}
}


/********************************************************************************************
 * @Description
 *  데이터셋에서 지정된 행(row)의 타입을 정의합니다.
 * 
 * @Syntax 
 * 	Dataset.setRowType(nRow:Integer, sType:Const)
 * 
 * @Parameters
 * 	nRow(String) : 대상 행의 위치(zero-based 인덱스)
 * 	sType(const) : 
 * 	const ROWTYPE_EMPTY = 0;
 * 	const ROWTYPE_NORMAL = 1;
 * 	const ROWTYPE_INSERT = 2;
 * 	const ROWTYPE_UPDATE = 4;
 * 	const ROWTYPE_DELETE = 8;
 * 	const ROWTYPE_GROUP = 16;
 * 
 * 	Sample Call:
 * 	var nRowType = this.Dataset00.setRowType(0, this.ROWTYPE_NORMAL);
 *  
 * @return
 * 	데이터셋에서 지정된 행의 타입을 정의합니다.
 *  만일 지정한 행이 존재하지 않으면 실패(false)를 반환합니다.
 ********************************************************************************************/
Dataset.prototype.setRowType = function(nRow, type){
	try{
		if(this.data[nRow] != undefined && isNull(type)){
			var isEqual = this.dataCompare(nRow);
			var currentRowType = this.data[nRow].ROW_TYPE;
			
			if(currentRowType == ROWTYPE_INSERT){
				
			}else if(currentRowType == ROWTYPE_DELETE){
				
			}else if(isEqual){
				this.data[nRow].ROW_TYPE = ROWTYPE_NORMAL;
				this.beforeData[nRow].ROW_TYPE = ROWTYPE_NORMAL;
				this.defaultData[nRow].ROW_TYPE = ROWTYPE_NORMAL;
			}else{
				this.data[nRow].ROW_TYPE = ROWTYPE_UPDATE;
				this.beforeData[nRow].ROW_TYPE = ROWTYPE_UPDATE;
				this.defaultData[nRow].ROW_TYPE = ROWTYPE_UPDATE;
			}
			
			return true;
		}else if(this.data[nRow] != undefined && !isNull(type)){
			if(type == ROWTYPE_NORMAL){
				this.data[nRow].ROW_TYPE = ROWTYPE_NORMAL;
				this.beforeData[nRow] = _.cloneDeep(this.data[nRow]);
				this.defaultData[nRow] = _.cloneDeep(this.data[nRow]);
			}else if(type == ROWTYPE_INSERT){
				this.data[nRow].ROW_TYPE = ROWTYPE_INSERT;
				this.beforeData[nRow] = _.cloneDeep(this.data[nRow]);
				this.defaultData[nRow] = _.cloneDeep(this.data[nRow]);
			}else if(type == ROWTYPE_DELETE){
				this.data[nRow].ROW_TYPE = ROWTYPE_DELETE;
			}else if(type == ROWTYPE_UPDATE){
				this.data[nRow].ROW_TYPE = ROWTYPE_UPDATE;
			}
			return true;
		}else{
			return false;
		}
	}catch(err){
		console.log('Dataset.setRowType() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 *  지정된 행(row)이 초기값과 비교하여 변경되었는지 확인하여 리턴합니다.
 * 
 * @Syntax 
 * 	Dataset.dataCompare(nRow)
 * 
 * @Parameters
 * 	nRow(String) : 대상 행의 위치(zero-based 인덱스)
 *  
 *  Sample Call:
 *  boolean isEqual = this.Dataset00.dataCompare(0);
 *  
 * @return
 * 	지정 된 행이 Dataset.setData()를 통해 셋팅 된 초기값과 비교하여 같은지 다른지를 
 *  boolean값으로 반환
 ********************************************************************************************/
Dataset.prototype.dataCompare = function(nRow){
	try{
		var isEqual = _.isEqual(this.data[nRow], this.defaultData[nRow])
		return isEqual;
	}catch(err){
		console.log('Dataset.dataCompare() Error : '+err.message);
		return null;
	}
}

/********************************************************************************************
 * @Description
 *  지정된 행(row)을 초기값으로 복원 합니다.(조회 시점)
 * 
 * @Syntax 
 * 	Dataset.setDefaultRow(nRow)
 * 
 * @Parameters
 * 	nRow(String) : 대상 행의 위치(zero-based 인덱스)
 *  
 *  Sample Call:
 *  this.Dataset00.setDefaultRow(0);
 *  
 * @return
 * 	지정 된 행을 조회 초기값으로 되돎림
 ********************************************************************************************/
Dataset.prototype.setDefaultRow = function(nRow){
	try{
		if(!isNull(this.data[nRow])){
			var rowType = this.getRowType(nRow);
			
			if(rowType == ROWTYPE_INSERT){
				this.data.splice(nRow, 1);
				this.beforeData.splice(nRow, 1);
				this.defaultData.splice(nRow, 1);
				this.rowposition--;
			}else{
				this.data[nRow] = _.cloneDeep(this.defaultData[nRow]);
			}
			
			return true;
		}
	}catch(err){
		console.log('Dataset.setDefaultRow() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 *  Dataset.currentRow에 Dataset.data의 현재 rowposition에 해당하는 정보를 입력합니다.
 * 
 * @Syntax 
 * 	Dataset.setCurrentRow()
 * 
 * @Parameters
 *  
 * @return
 * 	성공여부를 반환 합니다.(Boolean)
 ********************************************************************************************/
Dataset.prototype.setCurrentRow = function(){
	try{
		this.currentRow = null;
		var rowType = this.getRowType(this.rowposition);
		
		if(this.rowposition != -1 && rowType != ROWTYPE_DELETE){
			this.currentRow = (this.data[this.rowposition]);
		}
		
		return true;
	}catch(err){
		console.log('Dataset.setCurrentRow() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 *  지정된 행(nRow)으로 현재행 번호와 선택 된 행 정보를 입력 합니다.
 * 
 * @Syntax 
 * 	Dataset.selectRow(nRow)
 * 
 * @Parameters
 *  nRow(Integer) : 지정된 행
 *  
 * @return
 * 	성공여부를 반환 합니다.(Boolean)
 ********************************************************************************************/
Dataset.prototype.selectRow = function(nRow){
	try{
		this.rowposition = nRow;
		this.setCurrentRow();
		return true;
	}catch(err){
		console.log('Dataset.selectRow() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 *  지정된 행(nRow)의 ROW_TYPE을 8(삭제)로 변경 합니다.
 * 
 * @Syntax 
 * 	Dataset.deleteRow(nRow)
 * 
 * @Parameters
 *  nRow(Integer) : 지정된 행
 *  
 * @return
 * 	성공여부를 반환 합니다.(Boolean)
 ********************************************************************************************/
Dataset.prototype.deleteRow = function(nRow){
	try{
		var rowType = this.getRowType(nRow);
		
		if(rowType == ROWTYPE_INSERT){
			this.data.splice(nRow, 1);
			this.beforeData.splice(nRow, 1);
			this.defaultData.splice(nRow, 1);
		}else{
			this.data[nRow].ROW_TYPE = ROWTYPE_DELETE;
		}
		
		this.rowposition = -1;
		this.currentRow = null;
		return true;
	}catch(err){
		console.log('Dataset.deleteRow() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 *  지정된 행(nRow)를 삭제 합니다.
 *
 * @Syntax
 * 	Dataset.delete(nRow)
 *
 * @Parameters
 *  nRow(Integer) : 지정된 행
 *
 * @return
 * 	성공여부를 반환 합니다.(Boolean)
 ********************************************************************************************/
Dataset.prototype.deleteRowData = function(nRow){
	try{
			this.data.splice(nRow, 1);
			this.beforeData.splice(nRow, 1);
			this.defaultData.splice(nRow, 1);

		this.rowposition = -1;
		this.currentRow = null;
		return true;
	}catch(err){
		console.log('Dataset.deleteRowData() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 *  데이터셋에서 지정한 행(row)의 열(column)에 해당하는 값을 구하는 메소드입니다.
 * 
 * @Syntax 
 * 	Dataset.getColumn(nRow,nColIdx)
 *  Dataset.getColumn(nRow,strColID)
 * 
 * @Parameters
 *  nRow(Integer) : 값을 구하려는 행의 위치입니다. 행 위치의 시작값은 0입니다.
 *  nColIdx(Integer) : 값을 구하려는 열의 인덱스입니다.
 *  strColID(String) : 값을 구하려는 열의 ID입니다.
 *  
 *  Sample Call:
 *  var varCol;
 *  varCol = this.Dataset00.getColumn(2,1);
 *  varCol = this.Dataset00.getColumn(2,"cust_addr");
 *  
 * @return
 * 	대상 열의 값을 반환합니다. 만약, 지정한 열이 존재하지 않으면 undefined를 반환합니다.
 ********************************************************************************************/
Dataset.prototype.getColumn = function(nRow, strColID){
	try{
		var obj = this.data[nRow];
		var colValue = obj[strColID];
		
		return colValue;
	}catch(err){
		console.log('Dataset.getColumn() Error : '+err.message);
		return undefined;
	}	
}

/********************************************************************************************
 * @Description
 *  데이터셋에서 지정한 행(row)의 열(column)에 해당하는 값을 변경하는 메소드입니다.
 * 
 * @Syntax 
 * 	Dataset.setColumn(nRow,nColIdx,varVal)
 *  set.setColumn(nRow,strColID,varVal)
 * 
 * @Parameters
 *  nRow(Integer) : 값을 변경하려는 행의 위치입니다. 행 위치의 시작값은 0입니다.
 *  nColIdx(Integer) : 값을 변경하려는 열의 인덱스입니다.
 *  varVal(Variant) : 변경하려는 값입니다.
 *  strColID(String) : 값을 변경하려는 열의 ID입니다.
 *  
 *  Sample Call:
 *  var bSucc;
 *  bSucc = this.Dataset00.setColumn(1,0,"078543");
 *  bSucc = this.Dataset00.setColumn(1,"cust_zip","078543");
 *  
 * @return
 * 	성공하면 true를 반환하고, 실패하면 false를 반환합니다.
 ********************************************************************************************/
Dataset.prototype.setColumn = function(nRow, nColIdx, varVal){
	try{
		this.data[nRow][nColIdx]= varVal;
		this.setRowType(nRow);
		return true;
	}catch(err){
		console.log('Dataset.setColumn() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 *  지정된 행(nRow)의 데이터를 반환 합니다.
 * 
 * @Syntax 
 * 	Dataset.getRow(nRow)
 * 
 * @Parameters
 *  nRow(Integer) : 지정된 행
 *  
 * @return
 * 	지정된 행의 정보를 반환한다.
 ********************************************************************************************/
Dataset.prototype.getRow = function(nRow){
	try{
		return this.data[nRow];
	}catch(err){
		console.log('Dataset.getRow() Error : '+err.message);
		return null;
	}
}

/********************************************************************************************
 * @Description
 *  Dataset의 이벤트를 발생시킬지 여부를 설정하는 속성입니다
 * 
 * @Syntax 
 * 	Dataset(bEnableEvent) // set
 *  Dataset.enableevent // get  
 * 
 * @Parameters
 *  val : 값(boolean)
 *  
 * @return
 *  성공여부를 반환 합니다.(Boolean)
 ********************************************************************************************/
Dataset.prototype.set_enableevent = function(pEnableevent){
	try{
		this.enableevent = pEnableevent;
		return true;
	}catch(err){
		console.log('Dataset.set_enableevent() Error : '+err.message);
		return false;
	}
}

Dataset.prototype.deleteAll = function(){
	try{
		// object는 한개의 value와 키를 대입하여 함수를 실행시킵니다.
		_.forEach(this.data, function(n, key) {
			n.ROW_TYPE = ROWTYPE_DELETE;
		});
	}catch(err){
		console.log('Dataset.deleteRow() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 *  현재 데이터의 행 개수를 반환합니다.
 * 
 * @Syntax 
 * 	Dataset(bEnableEvent) // set
 *  Dataset.getRowCount // get  
 * 
 * @Parameters
 *  val : 값(boolean)
 *  
 * @return
 *  성공여부를 반환 합니다.(Boolean)
 ********************************************************************************************/
Dataset.prototype.getRowCount = function(){
	try{
		var data = '';
		var dataCount = 0;
		
		if(this.rawData.length > 0){
			data = this.rawData;
			dataCount = this.rawData.length;
			if(!this.rawData){
				dataCount = 0;
			}
		}
		else{
			data = this.data;
			dataCount = this.data.length;
			if(!this.data) dataCount = 0;
		}
		
		return dataCount;
	}catch(err){
		console.log('Dataset.getRowCount() Error : '+err.message);
		return false;
	}
}


/********************************************************************************************
 * @Description
 *  데이터셋에서 지정된 행(row)의 필터여부를 설정하는 메소드입니다.
 * 
 * @Syntax 
 * 	Dataset.setFilter(pFilterColumn)
 * 
 * @Parameters
 * 	pFilterColumn(Object) : 필터 조건
 *  
 *  Sample Call:
 *  var nRowType = this.Dataset00.setFilter({A:'filter String'});
 *  
 * @return
 * 	데이터셋에서 해당 조건으로 필터를 설정합니다.
 ********************************************************************************************/
Dataset.prototype.setFilter = function(pFilterColumn){
	try{
		if(!isNull(pFilterColumn)){
			_.set(_.find(this.data, pFilterColumn), 'FILTER_ROW', 'Y');
			_.set(_.find(this.beforeData, pFilterColumn), 'FILTER_ROW', 'Y');
			_.set(_.find(this.defaultData, pFilterColumn), 'FILTER_ROW', 'Y');
		}
		return true;
	}catch(err){
		console.log('Dataset.getRowCount() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 *  데이터셋에서 지정된 행(row)의 필터여부를 해제하는 메소드입니다.
 * 
 * @Syntax 
 * 	Dataset.initFilter(pFilterColumn)
 * 
 * @Parameters
 * 	pFilterColumn(Object) : 필터 조건
 *  
 *  Sample Call:
 *  var nRowType = this.Dataset00.initFilter({A:'filter String'});
 *  
 * @return
 * 	데이터셋에서 해당 조건으로 필터를 해제합니다.
 ********************************************************************************************/
Dataset.prototype.initFilter = function(pFilterColumn){
	try{
		if(!isNull(pFilterColumn)){
			_.set(_.find(this.data, pFilterColumn), 'FILTER_ROW', 'N');
			_.set(_.find(this.beforeData, pFilterColumn), 'FILTER_ROW', 'N');
			_.set(_.find(this.defaultData, pFilterColumn), 'FILTER_ROW', 'N');
		}else{
			_.set(_.find(this.data, {FILTER_ROW : 'Y'}), 'FILTER_ROW', 'N');
			_.set(_.find(this.beforeData, {FILTER_ROW : 'Y'}), 'FILTER_ROW', 'N');
			_.set(_.find(this.defaultData, {FILTER_ROW : 'Y'}), 'FILTER_ROW', 'N');
		}
		return true;
	}catch(err){
		console.log('Dataset.initFilter() Error : '+err.message);
		return false;
	}
}


/********************************************************************************************
 * @Description
 *  데이터셋에서 지정된 행(row)의 필터여부를 구하는 메소드입니다.
 * 
 * @Syntax 
 * 	Dataset.isFilterRow(nRow)
 * 
 * @Parameters
 * 	nRow(String) : 대상 행의 위치(zero-based 인덱스)
 *  
 *  Sample Call:
 *  var nRowType = this.Dataset00.isFilterRow(0);
 *  
 * @return
 * 	데이터셋에서 지정된 행의 필터여부를 반환합니다.
 *  만일 지정한 행이 존재하지 않으면 false를 반환합니다.
 ********************************************************************************************/
Dataset.prototype.isFilterRow = function(nRow){
	try{
		if(this.data[nRow] != undefined){
			if(this.data[nRow].FILTER_ROW == 'Y') return true;
			else return false;
		}
		
		return false; 
	}catch(err){
		console.log('Dataset.isFilterRow() Error : '+err.message);
		return false;
	}
}


/********************************************************************************************
 * @Description
 * 	frontend 자체 페이징 구현할 경우 rawData에 조회 된 자료를 로드하는 메소드 입니다.
 * 
 * @Syntax 
 * 	Dataset.setRawData(pData:JsonArray, pRowcnt:Integer)
 * 
 * @Parameters
 * 	pData(JsonArray) : 데이터셋에 입력 될 데이터 입니다.
 * 	pRowcnt(Integer) : 페이지 별 나타낼 개수 입니다.
 * 
 * @return
 * 	성공여부를 반환합니다.(Boolean)
 ********************************************************************************************/
Dataset.prototype.setRawData = function(pData, pRowCnt){
	try{
		this.clear();
		
		if(JSON.stringify(pData).indexOf('[') != 0){
			pData = [pData];
		}
		
		if(pData.length > 0){
			this.rawData = pData;
			this.pageChange(1, pRowCnt);
		}else{
			this.rawData = [];
		}
		return true;
	}catch(err){
		console.log('Dataset.setRawData() Error : '+err.message);
		return false;
	}
}


/********************************************************************************************
 * @Description
 *  frontend 자체 페이징 구현 시 페이지 변경 이벤트 입니다.
 * 
 * @Syntax 
 * 	Dataset.pageChange(pPage, pRowCnt)
 * 
 * @Parameters
 * 	pPage(Integer) : 페이지 변호
 * 	pRowCnt(Integer) : 페이지당 보여질 데이터 건수
 *  
 *  Sample Call:
 *  this.Dataset00.pageChange(1, 5);
 *  
 * @return
 * 	성공여부를 반환합니다.
 ********************************************************************************************/
Dataset.prototype.pageChange = function(pPage, pRowCnt){
	try{
		var data = _.filter(this.rawData, function(obj, index){	
			return (index >= ((pPage-1) * pRowCnt) && index < (pPage * pRowCnt));  
		});
		
		this.setData(data, null);
		return true; 
	}catch(err){
		console.log('Dataset.pageChange() Error : '+err.message);
		return false;
	}
}


/********************************************************************************************
 * @Description
 * 	데이터셋을 초기 조회 상태로 되돌립니다.
 * 
 * @Syntax 
 * 	Dataset.setDefault()
 * 
 * @Parameters 	
 * 
 * @return
 * 	성공여부를 반환합니다.(Boolean)
 ********************************************************************************************/
Dataset.prototype.setDefault = function(){
	try{
		this.rowposition = -1;
		this.currentRow = null;
		
		_.remove(this.defaultData, function(n) {
			return n['ROW_TYPE'] == ROWTYPE_INSERT;
		});

		this.data = _.cloneDeep(this.defaultData);
		this.beforeData = _.cloneDeep(this.defaultData);
		
		return true;
	}catch(err){
		console.log('Dataset.setDefault() Error : '+err.message);
		return false;
	}
}
/********************************************************************************************
 * @Description
 *  지정된 컬럼으로 정렬 합니다.
 *
 * @Syntax
 * 	Dataset.sort(column,way)
 *
 * @Parameters
 *  column(string) : 지정된컬럼
 *  way(string) : 정렬방식 ASC,DESC
 *
 * @return
 * 	성공여부를 반환 합니다.(Boolean)
 ********************************************************************************************/
Dataset.prototype.sort = function(pColumn, way){
	try{
		if(way =='DESC' || way == 'desc'){
			this.data.sort(function (a,b) {
				let x = a[pColumn].toLowerCase();
				let y = b[pColumn].toLowerCase();

				if(x < y){
					return 1;
				}
				if(x > y){
					return -1;
				}
				return 0;
			})
		}else if(way =='ASC' || way =='asc' || way==null || way==''){
			this.data.sort(function (a,b) {
				let x = a[pColumn].toLowerCase();
				let y = b[pColumn].toLowerCase();

				if(x < y){
					return -1;
				}
				if(x > y){
					return 1;
				}
				return 0;
			})
		}

		this.rowposition = -1;
		this.currentRow = null;
		return true;
	}catch(err){
		console.log('Dataset.sort() Error : '+err.message);
		return false;
	}
}
