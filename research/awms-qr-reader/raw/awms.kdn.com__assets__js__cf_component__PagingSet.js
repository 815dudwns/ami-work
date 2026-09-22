/********************************************************************************************
 *                                                                                          *                  
 *                                   PagingSet Component                                    *
 *                                                                                          * 
 * 작성자   : 박해수                                                                        *
 * 작성일   : 2019.01.26                                                                    *
 * ******************************************************************************************
 * 수정내역 :                                                                                
 *   - 2019.01.26 : 신규작성
 *   - 
 *   -  
 ********************************************************************************************/

/********************************************************************************************
 * 기능목록
 * ** Method  **                                                                                
 * 
 * ** Property **
 ********************************************************************************************/



/********************************************************************************************
 * @Description
 * 	페이징을 위한 파일 오브젝트입니다.
 * 
 * @Syntax 
 * 	PagingSet.PagingSet(pPageCnt, pRowCnt);
 * 
 * 	new PagingSet(10,10);
 *  // Create Object
 *  var paging = new PagingSet(10,10);
 * 
 * @Parameters
 * pPageCnt(Integer) : 화면에 보여질 페이지 번호 개수를 설정합니다. (기본 10)
 * pRowCnt(Integer) : 한 페이지에 나타날 게시물 개수를 설정합니다. (기본 10)
 * 
 * @return
 * 	PagingSet : 페이징 셋 객체
 ********************************************************************************************/
var PagingSet = function(pPageCnt, pRowCnt, pBindDataset, pVm){
	try{
		this.pageCnt = 10; //화면에 보여질 페이지 번호 개수
		this.rowCnt = 10; //한 페이지에 나타날 게시물 개수
		this.totalCnt = 0; //총 데이터 개수
		this.pageList = []; //화면에 보여질 페이지 배열
		this.currentPage = 1; //현재 페이지
		this.bindDataset = pBindDataset; //바인딩 된 데이터 셋
		
		if(!isNull(pPageCnt)) this.pageCnt = pPageCnt;
		if(!isNull(pRowCnt)) this.rowCnt = pRowCnt;
		this.makePageList();
		this.vm = pVm;
		
		return this;
	}catch(err){
		console.log('new PagingSet() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	총 건수 및 페이지별 건수 등을 이용하여 페이지 번호를 생성합니다.
 * 
 * @Syntax 
 * 	PagingSet.makePageList();
 * 
 * @Parameters
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
PagingSet.prototype.makePageList = function(){
	try{
		var firstPage = 1; //첫 페이지는 기본적으로 1페이지
		var lastPage = this.pageCnt; //마지막 페이지는 초기에 this.pageCnt 로 초기화 한다.
		var maxPage = parseInt(this.totalCnt / this.rowCnt,10) + (this.totalCnt%this.rowCnt > 0 ? 1 : 0);
		var calc = parseInt(this.currentPage/this.pageCnt,10); //현재페이지 / 화면에 보여질 페이지 기준
		
		if(this.currentPage%this.pageCnt == 0){
			calc--;
		}
		
		if(calc > 0){
			firstPage = calc * this.pageCnt + 1;
			lastPage = firstPage + this.pageCnt - 1;
			if(lastPage > maxPage) lastPage = maxPage;
		}
		this.pageList = [];
		for(var i=0 ; i < this.pageCnt ; i++){
			if(firstPage+i > maxPage) break;
			if(this.totalCnt / this.rowCnt > i && this.totalCnt != 0){
				this.pageList[i] = {'pageNo':parseInt(firstPage,10)+i};
			}else{
				this.pageList.splice(i, 1);
			}
		}
		
		if(_.findIndex(this.pageList, {pageNo : this.currentPage}) == -1){
			var maxPageObj = _.maxBy(this.pageList, function(o) {
				return o.pageNo;
			});
			
			if(!isNull(maxPageObj)){
				var maxPageNo = parseInt(maxPageObj['pageNo'],10);
				this.currentPage = maxPageNo;
			}
		}
		
		if(!isNull(this.bindDataset) && !isNull(this.vm)){
			var self = this.vm;
			
			this.bindDataset.pageChange(this.currentPage, this.getRowCnt());
			this.vm.$nextTick(function(){
				self.$forceUpdate();
          	});
		}
		return true;
	}catch(err){
		console.log('PagingSet.makePageList() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	파라메터로 넘겨받은 페이지로 페이지를 이동합니다. 
 * 
 * @Syntax 
 * 	PagingSet.movePage(pPageNo);
 * 
 * @Parameters
 * pPageNo(Integer) : 이동 할 페이지
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
PagingSet.prototype.movePage = function(pPageNo){
	try{
		this.currentPage = pPageNo;
		this.makePageList();
		return true;
	}catch(err){
		console.log('PagingSet.movePage() Error : '+err.message);
		return false;
	}	
}


/********************************************************************************************
 * @Description
 * 	총 건수를 입력합니다.
 * 
 * @Syntax 
 * 	PagingSet.setTotalCnt(pTotalCnt);
 * 
 * @Parameters
 * pTotalCnt(Integer) : 총 건수
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
PagingSet.prototype.setTotalCnt = function(pTotalCnt){
	try{
		this.totalCnt = pTotalCnt;
		this.makePageList();
		return true;
	}catch(err){
		console.log('PagingSet.setTotalCnt() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	현재의 총 페이지 개수를 리턴합니다.
 * 
 * @Syntax 
 * 	PagingSet.getTotalPage();
 * 
 * @Parameters
 * 
 * @return
 * 	cnt(Integer) : 페이지 개수
 ********************************************************************************************/
PagingSet.prototype.getTotalPage = function(){
	try{
		var totalPage = parseInt(this.totalCnt / this.rowCnt,10);
		if(this.totalCnt%this.rowCnt > 0) totalPage++;
		
		return totalPage;
	}catch(err){
		console.log('PagingSet.getTotalPage() Error : '+err.message);
		return false;
	}	
}
/********************************************************************************************
 * @Description
 * 	이전 페이지 클릭 시 동작하는 이벤트 입니다.
 * 
 * @Syntax 
 * 	PagingSet.prevClick();
 * 
 * @Parameters
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
PagingSet.prototype.prevClick = function(){
	try{
		if(this.currentPage-1 > 0){
			this.movePage(this.currentPage-1);
			return true
		}
	}catch(err){
		console.log('PagingSet.prevClick() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	다음 페이지 클릭 시 동작하는 이벤트 입니다.
 * 
 * @Syntax 
 * 	PagingSet.nextClick();
 * 
 * @Parameters
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
PagingSet.prototype.nextClick = function(){
	try{
		if(this.currentPage+1 <= Math.ceil(this.totalCnt / this.rowCnt)){
			this.movePage(this.currentPage+1);
			return true;
		}
	}catch(err){
		console.log('PagingSet.nextClick() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	이전 [this.pageCnt]개 페이지를 로드 합니다. (<< >> 버튼 클릭 시 발생 이벤트)
 * 
 * @Syntax 
 * 	PagingSet.prevPageSetClick();
 * 
 * @Parameters
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
PagingSet.prototype.prevPageSetClick = function(){
	try{
		var minPageObj = _.minBy(this.pageList, function(o) {
			return o.pageNo;
		});
		var minPageNo = parseInt(minPageObj['pageNo'],10);
			
		if(minPageNo-1 > 0){
			this.movePage(parseInt(minPageNo,10)-1);
			return true;
		}
	}catch(err){
		console.log('PagingSet.prevPageSetClick() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	다음 [this.pageCnt]개 페이지를 로드 합니다. (<< >> 버튼 클릭 시 발생 이벤트))
 * 
 * @Syntax 
 * 	PagingSet.nextPageSetClick();
 * 
 * @Parameters
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
PagingSet.prototype.nextPageSetClick = function(){
	try{
		var maxPageObj = _.maxBy(this.pageList, function(o) {
			return o.pageNo;
		});
		var maxPageNo = parseInt(maxPageObj['pageNo'],10);
		
		if(maxPageNo+1 <= Math.ceil(this.totalCnt/this.rowCnt)){
			this.movePage(parseInt(maxPageNo,10)+1);
			return true;
		}
	}catch(err){
		console.log('PagingSet.nextPageSetClick() Error : '+err.message);
		return false;
	}	
}


/********************************************************************************************
 * @Description
 * 	이전 [this.pageCnt]개 페이지가 존재하는지 여부를 반환 합니다.
 * 
 * @Syntax 
 * 	PagingSet.isPrevPage();
 * 
 * @Parameters
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
PagingSet.prototype.isPrevPage = function(){
	try{
		var minPageObj = _.minBy(this.pageList, function(o) {
			return o.pageNo;
		});
		if(!isNull(minPageObj)){
			var minPageNo = parseInt(minPageObj['pageNo'],10);
			if(minPageNo-1 > 0) return false;
			else return true;
		}else{
			return false;
		}
	}catch(err){
		console.log('PagingSet.isPrevPage() Error : '+err.message);
		return false;
	}	
}


/********************************************************************************************
 * @Description
 * 	다음 [this.pageCnt]개 페이지가 존재하는지 여부를 반환 합니다.
 * 
 * @Syntax 
 * 	PagingSet.isNextPage();
 * 
 * @Parameters
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
PagingSet.prototype.isNextPage = function(){
	try{
		var maxPageObj = _.maxBy(this.pageList, function(o) {
			return o.pageNo;
		});
		if(!isNull(maxPageObj)){
			var maxPageNo = parseInt(maxPageObj['pageNo'],10);
			if(maxPageNo+1 < this.totalCnt / this.rowCnt) return false;
			else return true;
		}else{
			return false;
		}
	}catch(err){
		console.log('PagingSet.isNextPage() Error : '+err.message);
		return false;
	}	
}


/********************************************************************************************
 * @Description
 * 	이전 [this.pageCnt]개 페이지가 존재하는지 여부를 반환 합니다.
 * 
 * @Syntax 
 * 	PagingSet.isPrev();
 * 
 * @Parameters
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
PagingSet.prototype.isPrev = function(){
	try{
		if(this.currentPage-1 > 0) return false;
		else return true;
	}catch(err){
		console.log('PagingSet.isPrev() Error : '+err.message);
		return false;
	}	
}


/********************************************************************************************
 * @Description
 * 	다음 [this.pageCnt]개 페이지가 존재하는지 여부를 반환 합니다.
 * 
 * @Syntax 
 * 	PagingSet.isNext();
 * 
 * @Parameters
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
PagingSet.prototype.isNext = function(){
	try{
		if(this.currentPage+1 <= Math.ceil(this.totalCnt / this.rowCnt)) return false;
		else return true;
	}catch(err){
		console.log('PagingSet.isNext() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	한 페이지에 나타날 게시물 개수를 설정한다.
 * 
 * @Syntax 
 * 	PagingSet.setRowCnt();
 * 
 * @Parameters
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
PagingSet.prototype.setRowCnt = function(pRowCnt){
	try{
		return this.rowCnt = pRowCnt;
	}catch(err){
		console.log('PagingSet.setRowCnt() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	한 페이지에 나타날 게시물 개수를 리턴합니다.
 * 
 * @Syntax 
 * 	PagingSet.getRowCnt();
 * 
 * @Parameters
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
PagingSet.prototype.getRowCnt = function(){
	try{
		return this.rowCnt;
	}catch(err){
		console.log('PagingSet.getRowCnt() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	화면에 보여질 페이지 번호 개수를 설정합니다.
 * 
 * @Syntax 
 * 	PagingSet.setPageCnt(pPageCnt);
 * 
 * @Parameters
 * pPageCnt(Integer) : 한 화면에 보여질 페이지 번호 개수
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
PagingSet.prototype.setPageCnt = function(pPageCnt){
	try{
		return this.pageCnt = pPageCnt;
	}catch(err){
		console.log('PagingSet.setPageCnt() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	화면에 보여질 페이지 번호 개수를 리턴 합니다.
 * 
 * @Syntax 
 * 	PagingSet.getPageCnt();
 * 
 * @Parameters
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
PagingSet.prototype.getPageCnt = function(){
	try{
		return this.pageCnt;
	}catch(err){
		console.log('PagingSet.getPageCnt() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	현재 페이지를 리턴합니다.
 * 
 * @Syntax 
 * 	PagingSet.getCurrentPage();
 * 
 * @Parameters
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
PagingSet.prototype.getCurrentPage = function(){
	try{
		return this.currentPage;
	}catch(err){
		console.log('PagingSet.getCurrentPage() Error : '+err.message);
		return false;
	}	
}