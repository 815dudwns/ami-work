/********************************************************************************************
 *                                                                                          *                  
 *                                   SingleFileSet Component                                      *
 *                                                                                          * 
 * 작성자   : 박해수                                                                        *
 * 작성일   : 2019.01.23                                                                    *
 * ******************************************************************************************
 * 수정내역 :                                                                                
 *   - 2019.01.23 : 신규작성
 *   - 
 *   -  
 ********************************************************************************************/

/********************************************************************************************
 * 기능목록
 * ** Method  **                                                                                
 * SingleFileSet(pUploadPath) : 데이타를 테이블 형태로 저장하는 오브젝트입니다. 
 * uploadFile(pUploadPath): 파일 업로드 시 사용되는 메소드 입니다.
 * getFileList(pFileId, pFileKey, pFileHangmok) : 파일 리스트를 가져오는 메소드 입니다.
 * getFile(pFileId, pFileKey, pFileHangmok, pFileNo) : 특정파일 정보를 가져오는 메소드 입니다.
 * handleFileUpload(files) : input file 컴포넌트에 파일이 등록 될 때마다 this.fileData에 해당 파일정보를 쌓는다.
 * getFileCnt : 현재 저장 된 파일 개수를 가져온다.
 * getFileList : 현재 저장 된 파일 리스트를 가져온다.
 * 
 * ** Property **
 ********************************************************************************************/



/********************************************************************************************
 * @Description
 * 	파일전송을 위한 파일 오브젝트입니다.
 * 
 * @Constructor
 * 	new SingleFileSet();
 *  // Create Object
 *  var ds = new SingleFileSet();
 ********************************************************************************************/
var SingleFileSet = function(pServiceAbbrNm, pIsUploadFixedName, pFixedFileName, pAutoUpload){
	try{
		this.fileData = []; //업로드 할 파일 데이터
		this.maxCnt = 1; //최대개수
		this.uploadPercentage = 0; //업로드 진행%
		this.progressText = '파일을 선택해 주세요'; //업로드 진행 상태 (텍스트)
		this.fileList = []; //저장 된 파일 리스트
		this.uploadPath = ''; //업로드 파일 경로
		this.striped = true; //업로드 진행상태 시 애니메이션 상태
		this.serviceAbbrNm = '';
		this.autoUpload = true; //파일 선택 시 즉시 업로드 
		this.isUploadFixedName = pIsUploadFixedName;
		this.fixedFileName = pFixedFileName;
		this.fileId = '';
		this.fileHangmok = '';
		
		this.pFileid = null;
		this.pFileKey = null;
		this.pFileHangmok = null;
		
		if(!isNull(pServiceAbbrNm)) this.serviceAbbrNm = pServiceAbbrNm;
		if(!isNull(pAutoUpload)) this.autoUpload = pAutoUpload;
		
		if(isNull(this.serviceAbbrNm)){
			console.log('new SingleFileSet() Error : ServiceAbbrNm is required.');
			return false;
		}
		
		return this;
	}catch(err){
		console.log('new SingleFileSet() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 	파일 정보 초기화
 * 
 * @Syntax 
 * 	SingleFileSet.init();
 * 
 * @Parameters
 * 
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
SingleFileSet.prototype.init = function(){
	try{
		this.fileData = []; //업로드 할 파일 데이터
		this.uploadPercentage = 0; //업로드 진행%
		this.progressText = ''; //업로드 진행 상태 (텍스트)
		this.fileList = []; //저장 된 파일 리스트
		this.striped = true; //업로드 진행상태 시 애니메이션 상태
        
		return true;
	}catch(err){
		console.log('SingleFileSet.init() Error : '+err.message);
		return false;
	}	
}

/********************************************************************************************
 * @Description
 * 업로드 파일 정보 초기화
 *
 * @Syntax
 * 	SingleFileSet.init();
 *
 * @Parameters
 *
 * @return
 * 	boolean : 성공여부
 ********************************************************************************************/
SingleFileSet.prototype.dataInit = function(){
	try{
		this.fileData = []; //업로드 할 파일 데이터
		this.uploadPercentage = 0; //업로드 진행%
		this.progressText = ''; //업로드 진행 상태 (텍스트)
		this.striped = true; //업로드 진행상태 시 애니메이션 상태

		return true;
	}catch(err){
		console.log('SingleFileSet.init() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 * 	파일 업로드 시 사용되는 메소드 입니다.
 * 
 * @Syntax 
 * 	SingleFileSet.uploadFile(pFileId, pFileKey, pFileHangmok)
 * 
 * @Parameters
 * 	pUploadPath(String) : 업로드 될 폴더 경로 입니다.
 * 
 * @return
 * 	업로드 된 파일 정보 입니다.
 ********************************************************************************************/
SingleFileSet.prototype.uploadFile = async function(pFileId, pFileKey, pFileHangmok, pMessageYn){
	try{
		let formData = new FormData();
        var uploadCount = 1;
        var returnData = null;
        var SingleFileSet = this;
		var returnValue = '';
        
        if(this.fileData.length == 0){
        	this.uploadPercentage = 0;
        	this.progressText = '파일이 존재하지 않습니다.';
        	return;
        }
		
        if(isNull(pFileId)){
        	console.log('FILE_ID is not entered');
        	return false;
        } 
        if(isNull(pFileKey)){
        	console.log('FILE_KEY is not entered');
        	return false;
        }
        if(isNull(pFileHangmok)){
        	console.log('FILE_HANG_MOK is not entered');
        	return false;
        }
        
        if(isNull(pMessageYn)){
        	pMessageYn = true;
        }
        
        formData.append('serviceAbbrNm', this.serviceAbbrNm);
        formData.append('upload_path', this.serviceAbbrNm + '\\' + pFileId + '\\' + pFileHangmok);
        formData.append('fileId', pFileId);
        formData.append('fileKey', pFileKey);
        formData.append('fileHangmok', pFileHangmok);
        
        if(this.isUploadFixedName == true){
        	formData.append('upload_fixed_name', this.fixedFileName);
        }
        
        for(var i=0 ; i < this.fileData.length ; i++){
        	var fileObj = this.fileData[i];
        	
        	if(!isNull(fileObj)){
        		formData.append('file'+uploadCount, fileObj);	
        		uploadCount++;
        	}
        }
        //2019.02.27 박해수 : es6문법 제거
        /*
        for(let fileObj of this.fileData){
        	if(!isNull(fileObj)){
        		formData.append('file'+uploadCount, fileObj);	
        		uploadCount++;
        	}
        }
        */
        this.progressText = '0 %';
        returnData = await axios.post('/commons/file/upload',
    		formData,
            {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress: function( progressEvent ) {
                	var per = parseInt( Math.round( ( progressEvent.loaded * 100 ) / progressEvent.total ) );
                	this.progressText = per + ' %';
                	
                	if(per >= 100){
                		this.striped = false;
                		if(pMessageYn){
                			notifySubmit('success', '파일 업로드', '업로드가 완료되었습니다.', 'icon-caution');
                		}
                	}
                	
                    this.uploadPercentage = per;
                }.bind(this)
            }
        ).then(function(response) {
			var data = response.data;
			
			SingleFileSet.fileList = data;
			SingleFileSet.fileData = [];
			SingleFileSet.progressText = '업로드 완료';
			returnValue = true;
		}).catch(function(error) {
			console.error('error:', error);
			returnValue = false;
		});

		return returnValue;
	}catch(err){
		console.log('SingleFileSet.uploadFile() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 * 	엑셀파일 업로드 시 사용되는 메소드 입니다.
 * 
 * @Syntax 
 * 	SingleFileSet.excelFileUpload(pTarget)
 * 
 * @Parameters
 * 	pTarget(evnet.target.files) : 업로드 할 파일정보
 * 
 * @return
 * 	엑셀파일을 Array로 변경하여 리턴합니다.
 ********************************************************************************************/
SingleFileSet.prototype.excelFileUpload = function(pTarget){
	try{
		var files = pTarget.files;
		if(files.length > 0){
			let formData = new FormData();
	        var returnData = null;
	        var uploadCount = 1;
	        
	        for(var i=0 ; i < files.length ; i++){
	        	var fileObj = files[i];
	        	
	        	if(!isNull(fileObj)){
	        		formData.append('file'+uploadCount, fileObj);	
	        		uploadCount++;
	        	}
	        }
	        //es6 문법제거
	        /*
	        for(let fileObj of files){
	        	if(!isNull(fileObj)){
	        		formData.append('file'+uploadCount, fileObj);	
	        		uploadCount++;
	        	}
	        }
	        */
	        this.progressText = '0 %';
	        returnData = axios.post('/commons/file/upload/excel',
	    		formData,
	            {
	                headers: {
	                    'Content-Type': 'multipart/form-data'
	                },
	                onUploadProgress: function( progressEvent ) {
	                	var per = parseInt( Math.round( ( progressEvent.loaded * 100 ) / progressEvent.total ) );
	                	this.progressText = per + ' %';
	                	
	                	if(per >= 100){
	                		this.striped = false;
	                	}
	                	
	                    this.uploadPercentage = per;
	                }.bind(this)
	            }
	        ).catch(function(err){
	            return console.log('error : '+err);
	        });

	        pTarget.type = '';
			pTarget.type = 'file';
			this.progressText = '업로드 완료';
			
	        return returnData;
		}
	}catch(err){
		console.log('SingleFileSet.excelFileUpload() Error : '+err.message);
		return false;
	}
}


/********************************************************************************************
 * @Description
 * 	특정파일 정보를 가져오는 메소드 입니다.
 * 
 * @Syntax 
 * 	SingleFileSet.getFile(pFileId, pFileKey, pFileHangmok, pFileNo)
 * 
 * @Parameters
 * pFileId(String) : 파일아이디(테이블 명)
 * pFileKey(String) :  파일키(해당테이블의 PK조합)
 * pFileHangmok(String) : 사용자 지정 항목 (ex) logo, img, filelist 등)
 * pFileNo(Integer) : 파일 순번
 * 
 * @return
 * 	파일리스트
 ********************************************************************************************/
SingleFileSet.prototype.getFiles = function(pFileId, pFileKey, pFileHangmok, pFileNo){
	try{
		var returnData = null;
		var self = this;
		var returnValue = '';
		
        if(isNull(pFileId)){
        	console.log('SingleFileSet.getFile() : FILE_ID is not entered');
        	return false;
        } 
        if(isNull(pFileKey)){
        	console.log('SingleFileSet.getFile() : FILE_KEY is not entered');
        	return false;
        }
        if(isNull(pFileHangmok)){
        	console.log('SingleFileSet.getFile() : FILE_HANG_MOK is not entered');
        	return false;
        }
        
        this.init();
        returnData = axios.get('/commons/file',
		{
			//post는 data사용 
			params: {
				serviceAbbrNm: this.serviceAbbrNm,
				fileId: pFileId,
				fileKey: pFileKey,
				fileHangmok: pFileHangmok,
				fileNo: pFileNo
	    	},
	    	loading: false
	    }).then(function(response) {
			var data = response.data;
			self.fileList = data;
		}).catch(function(error) {
			console.error('error:', error);
		});


	}catch(err){
		console.log('SingleFileSet.getFile() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 * 	파일을 삭제 한다.
 *
 * @Syntax
 * 	SingleFileSet.delFiles(pFileId, pFileKey, pFileHangmok, pFileNo, nRow)
 *
 * @Parameters
 * pFileId(String) : 파일아이디(테이블 명)
 * pFileKey(String) :  파일키(해당테이블의 PK조합)
 * pFileHangmok(String) : 사용자 지정 항목 (ex) logo, img, filelist 등)
 * pFileNo(Integer) : 파일 순번
 * nRow : 삭제 할 파일 행
 *
 * @return
 * boolean : 성공여부
 ********************************************************************************************/
SingleFileSet.prototype.delFiles = async function(){
	try{
		var returnData = null;
		var self = this;

		var param={
			  serviceAbbrNm : this.serviceAbbrNm
			, delFileList : _.filter(this.fileList,{ROW_TYPE : "8"})
		}

        returnData = await axios.post('/commons/file/delFiles', param).then(function(response) {
	        return true;
		}).catch(function(error) {
			console.error('error:', error);
			return false;
		});
	}catch(err){
		console.log('FileSet.delFiles() Error : '+err.message);
		return false;
	}
}


/********************************************************************************************
 * @Description
 * 	파일의 로우타입을 삭제로 변경한다
 * 
 * @Syntax 
 * 	SingleFileSet.delTypes(pFileId, pFileKey, pFileHangmok, pFileNo)
 * 
 * @Parameters
 * pFileId(String) : 파일아이디(테이블 명)
 * pFileKey(String) :  파일키(해당테이블의 PK조합)
 * pFileHangmok(String) : 사용자 지정 항목 (ex) logo, img, filelist 등)
 * pFileNo(Integer) : 파일 순번
 * nRow : 삭제 할 파일 행
 * 
 * @return
 * boolean : 성공여부
 ********************************************************************************************/
SingleFileSet.prototype.delTypes = function(pFileId, pFileKey, pFileHangmok, pFileNo){

	var self = this;

	this.progressText='';

	if(this.fileData.length>0){
		this.fileData = [];
	}

	if(_.findIndex(this.fileList, { 'FILE_ID': pFileId.toString(), 'FILE_KEY': pFileKey.toString(), 'FILE_HANGMOK': pFileHangmok.toString()}) > -1){
		this.fileList[_.findIndex(this.fileList, { 'FILE_ID': pFileId.toString(), 'FILE_KEY': pFileKey.toString(), 'FILE_HANGMOK': pFileHangmok.toString()})].ROW_TYPE = '8';
	}

}


/********************************************************************************************
 * @Description
 * 	input file 컴포넌트에 파일이 등록 될 때마다 this.fileData에 해당 파일정보를 쌓는다.
 * 
 * @Syntax 
 * 	SingleFileSet.handleFileUpload(target, pFileid, pFileKey, pFileHangmok)
 * 
 * @Parameters
 * target(evnet.target.files) : 업로드 할 파일정보
 * pFileId(String) : 파일아이디(테이블 명)
 * pFileKey(String) :  파일키(해당테이블의 PK조합)
 * pFileHangmok(String) : 사용자 지정 항목 (ex) logo, img, filelist 등)
 * 
 * @return
 * 	
 ********************************************************************************************/
SingleFileSet.prototype.handleFileUpload = function(target, pFileid, pFileKey, pFileHangmok){
	try{
		var files = target.files;
		if(files.length > 0){
			var fileDataCnt = this.fileData.length; //올릴예정 CNT
			var fileListCnt = _.filter(this.fileList, {'ROW_TYPE':'1'}).length; //올라간 CNT
			var currentFileCnt = files.length; //현재 시도하는 CNT
			var sumCnt = fileDataCnt+fileListCnt+currentFileCnt;
			
			if(sumCnt > this.maxCnt){
				target.type = '';
				target.type = 'file';
//				alert('파일 업로드 가능한 최대 개수를\n초과하였습니다. ('+sumCnt+'/'+this.maxCnt+')');
				console.log('File Count Over : [Max Count] : '+this.maxCnt);
				return -1;
			}
						
			this.uploadPercentage = 0;
			this.progressText = '';
			
			for(var i=0 ; i < files.length ; i++){
				var fileObj = files[i];
				this.fileData.push(fileObj);
				this.progressText = '업로드 대기 : '+this.fileData.length+'개';
			}
			//es6 문법제거
			/*
			for(let fileObj of files){
				this.fileData.push(fileObj);
				this.progressText = '업로드 대기 : '+this.fileData.length+'개';
			}
			*/
//			target.type = '';
//			target.type = 'file';
			
			if(isNull(pFileid)){
				console.log('new handleFileUpload() Error : fileid is required.');
				return false;
			}
			if(isNull(pFileKey)){
				console.log('new handleFileUpload() Error : fileKey is required.');
				return false;
			}
			if(isNull(pFileHangmok)){
				console.log('new handleFileUpload() Error : fileHangmok is required.');
				return false;
			}
			
			// if(this.autoUpload){
			// 	this.uploadFile(pFileid, pFileKey, pFileHangmok);
			// }else{
				this.pFileid = pFileid;
				this.pFileKey = pFileKey;
				this.pFileHangmok = pFileHangmok;
			// }
		}else{
			console.log('SingleFileSet.handleFileUpload() Error : fail file paste');
			return false;
		}
		return true;
	}catch(err){
		console.log('SingleFileSet.handleFileUpload() Error : '+err.message);
		return false;
	}
}

SingleFileSet.prototype.conUpload = function(){
	this.uploadFile(this.pFileid, this.pFileKey, this.pFileHangmok, false);
}

/********************************************************************************************
 * @Description
 * 	현재 업로드 된된 파일 개수를 리턴한다.
 *
 * @Syntax
 * 	SingleFileSet.getFileDataCnt(files)
 *
 * @Parameters
 *
 * @return
 * fileCnt(Integer) : 파일 개수
 ********************************************************************************************/
SingleFileSet.prototype.getFileDataCnt = function(){
	try{
		return this.fileData.length;
	}catch(err){
		console.log('SingleFileSet.getFileCnt() Error : '+err.message);
		return -1;
	}
}

/********************************************************************************************
 * @Description
 * 	현재 저장 된 파일 개수를 리턴한다.
 * 
 * @Syntax 
 * 	SingleFileSet.getFileCnt(files)
 * 
 * @Parameters
 * 
 * @return
 * fileCnt(Integer) : 파일 개수
 ********************************************************************************************/
SingleFileSet.prototype.getFileCnt = function(){
	try{
		var cnt = _.filter(this.fileList, {'ROW_TYPE':'1'}).length;
		return cnt;
	}catch(err){
		console.log('SingleFileSet.getFileCnt() Error : '+err.message);
		return -1;
	}
}

/********************************************************************************************
 * @Description
 * 	현재 저장 된 파일 리스트를 가져온다.
 * 
 * @Syntax 
 * 	SingleFileSet.getFileList(files)
 * 
 * @Parameters
 * 
 * @return
 * fileList(Object) : 파일 리스트
 ********************************************************************************************/
SingleFileSet.prototype.getFileList = function(){
	try{
		return this.fileList;
	}catch(err){
		console.log('SingleFileSet.getFileList() Error : '+err.message);
		return -1;
	}
}

/********************************************************************************************
 * @Description
 * 	파일을 다운로드 한다.
 * 
 * @Syntax 
 * 	SingleFileSet.download(pFilename, pFilePath)
 * 
 * @Parameters
 * pFilename(String) : 실제 파일명
 * pFilePath(String) : upload폴더 하위 파일 패스
 * 
 * @return
 * fileList(Object) : 파일 리스트
 ********************************************************************************************/
SingleFileSet.prototype.download = function(pFileId, pFileKey, pFileHangmok, pFileNo, pFilename, pFilePath){
	try{
		axios({
			url: '/upload'+pFilePath,
			method: 'GET',
			responseType: 'blob', // important
		}).then(function(response) {
			const url = window.URL.createObjectURL(new Blob([response.data]));
			const link = document.createElement('a');
			link.href = url;
			link.setAttribute('download', pFilename);
			document.body.appendChild(link);
			
			if (navigator.appVersion.toString().indexOf('.NET') > 0)
		        window.navigator.msSaveBlob(new Blob([response.data]), pFilename);
			else link.click();
			return true;
		});
	}catch(err){
		console.log('SingleFileSet.download() Error : '+err.message);
		return false;
	}
}

/********************************************************************************************
 * @Description
 * 	파일 저장 시 사용되는 메소드 입니다.
 *
 * @Syntax
 * 	SingleFileSet.saveFiles(pFileKey, pMessageYn)
 *
 * @Parameters
 * 	pFileKey(String) : 파일키
 * 	pMessageYn(String) : 업로드 시 메세지 여부
 *
 * @return
 *
 ********************************************************************************************/
SingleFileSet.prototype.saveFiles = async function(pFileKey, pMessageYn){
	var returnValue = false;

	if (isNull(this.fileId)) {
		console.log('FILE_ID is not entered');
		return false;
	}
	if (isNull(pFileKey)) {
		console.log('FILE_KEY is not entered');
		return false;
	}
	if (isNull(this.fileHangmok)) {
		console.log('FILE_HANG_MOK is not entered');
		return false;
	}

	if (isNull(pMessageYn)) {
		pMessageYn = false;
	}

	if(_.filter(this.fileList, {'ROW_TYPE':'8'}).length>0){
		await this.delFiles(this.fileId,pFileKey,this.fileHangmok,null,null,false).then(function(response) {
			returnValue = response;
		});
	}

	if(this.fileData.length>0) {
		await this.uploadFile(this.fileId, pFileKey, this.fileHangmok, false).then(function(response) {
			returnValue = response;
		});
	}
	if(pMessageYn){
		if(returnValue) notifySubmit('success', '파일 업로드', '업로드가 완료되었습니다.', 'icon-caution');
		else notifySubmit('error', '파일 업로드', '파일업로드에 실패하였습니다.', 'icon-caution');
	}

	return returnValue;
}

/********************************************************************************************
 * @Description
 * 업로드 파일 존재 여부
 *
 * @Syntax
 * 	SingleFileSet.uploadYn();
 *
 * @Parameters
 *
 * @return
 * 	boolean : 업로드 파일 존재 여부
 ********************************************************************************************/
SingleFileSet.prototype.uploadYn = function(){
	if(this.fileData.length>0 || _.filter(this.fileList,{ROW_TYPE : "8"}).length>0){
		return true;
	}else{
		return false;
	}
}