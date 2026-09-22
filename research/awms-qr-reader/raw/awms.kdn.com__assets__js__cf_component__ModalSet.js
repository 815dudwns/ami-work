/********************************************************************************************
 *                                                                                          *                  
 *                                   ModalSet Component                                     *
 *                                                                                          * 
 * 작성자   : 박해수                                                                        *
 * 작성일   : 2019.01.27                                                                    *
 * ******************************************************************************************
 * 수정내역 :                                                                                
 *   - 2019.01.27 : 신규작성
 *   - 
 *   -  
 ********************************************************************************************/

/********************************************************************************************
 * 기능목록
 * ** Method  **                                                                                
 * ModalSet(pSize, pCloseBtn, pConfirmBtn, pType) : 모달팝업을 나타내기 위한 데이터 오브젝트입니다.
 * 
 * ** Property **
 ********************************************************************************************/



/********************************************************************************************
 * @Description
 * 	모달팝업을 나타내기 위한 데이터 오브젝트입니다.
 * 
 * @Syntax 
 * 	new ModalSet(pId);
 *  // Create Object
 *  var ds = new ModalSet(pId);
 * 
 * @Parameters
 * pId(String) : 모달 오브젝트 아이디
 * 
 * @return
 * ModalSet()
 ********************************************************************************************/
var ModalSet = function(pId){
	try{
		this.id = pId;
		this.size = 'small'; //화면 사이즈 (small, middle, large)
		this.confirmBtn = true; //확인버튼
		this.closeBtn = false; //닫기버튼
		this.cancelBtn = false; //확인버튼 
		this.type = 'message'; //normal, blank, confirm, message
		this.title = '';
		this.message = '';
		this.show = false;
		this.currentId = '';
		this.customData = '';
		
		return this;
	}catch(err){
		console.log('new ModalSet() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	모달 팝업을 오픈 합니다.
 * 
 * @Syntax 
 * 	ModalSet.openModal(pType, pTitle, pMessage, pSize, pId, pCustomData)
 * 
 * @Parameters
 * pType(String) : 팝업 타입 (message, confirm)
 * pTitle(String) : 팝업 제목
 * pMessage(String) : 팝업내용
 * pSize(String) : 팝업 사이즈 (small, middle, large)
 * pId(String) : 현재 오픈하는 팝업의 아이디
 * pCustomData(String) : 현재 오픈하는 팝업에 전달되는 데이터
 * 
 * @return
 * boolean : 성공여부
 ********************************************************************************************/
ModalSet.prototype.openModal = function(pType, pTitle, pMessage, pSize, pId, pCustomData){
	try{
		if(!isNull(pSize)) this.size = pSize;
		if(!isNull(pType)) this.type = pType;
		if(!isNull(pTitle)) this.title = pTitle;
		if(!isNull(pMessage)) this.message = pMessage;
		
		if(this.type == 'message'){
			this.confirmBtn = true;
			this.closeBtn = false;
			this.cancelBtn = false;
		}else if(this.type == 'confirm'){
			this.confirmBtn = true;
			this.closeBtn = false;
			this.cancelBtn = true;
		}else{
			this.confirmBtn = true;
			this.closeBtn = false;
			this.cancelBtn = false;
		}
		
		var modalObj = $('#' + this.id); //레이어의 id를 modalObj변수에 저장
		if (modalObj.outerWidth() < $(document).width()) modalObj.css('margin-left', '-' + modalObj.outerWidth() / 2 + 'px');
	    else modalObj.css('left', '0px');
		
		$("html").css("overflow", "hidden");
		this.show = true; 
		this.currentId = pId;
		this.customData = pCustomData;
		
		return true;
	}catch(err){
		console.log('ModalSet.openModal() Error : '+err.message);
		return true
	}
}

/********************************************************************************************
 * @Description
 * 	모달 팝업을 닫습니다.
 * 
 * @Syntax 
 * 	ModalSet.closeModal(pGb)
 * 
 * @Parameters
 * pGb(String) : 어떤 동작에 의해 닫는지 구분값
 * 
 * @return
 * boolean : 성공여부
 ********************************************************************************************/
ModalSet.prototype.closeModal = function(pGb){
	try{
		this.show = false; 
		$("html").css("overflow", "auto");
		
		return pGb;
	}catch(err){
		console.log('ModalSet.closeModal() Error : '+err.message);
		return false;
	}
	
}