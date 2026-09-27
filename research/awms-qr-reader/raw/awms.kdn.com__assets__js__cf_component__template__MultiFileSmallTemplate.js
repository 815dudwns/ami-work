/********************************************************************************************
 * @Writer
 *  박해수 2019.01.26
 *
 * @Description
 * 	파일업로드 템플릿
 *
 * @Syntax
 *  $.get('/assets/cf_component/template/MultiFileTemplate.html', function(response){
 *		$('head').append(response); 
 *	});
 * 	<file-uploader :fileset="screenshotFile" :type="'img'"></file-uploader>
 *
 * @Parameters
 *  fileset : FileSet => screenshotFile: new FileSet(pSetUrl, pGetUrl, pDelUrl, pUploadPath, pMaxCnt),
 *  type : list, img
 *  filekey : 키 조합(여러개 키를 합칠 경우 #으로 붙임)
 ********************************************************************************************/

Vue.component('file-uploader-small', {
	props: ['fileset', 'type', 'fileid', 'filekey', 'filehangmok', 'title', 'modify', 'floatnone', 'imgwidth', 'uploadbtn','uploadExtension'],
	data: function(){
		return{
			mouseOver: -1,
			mouseOver2: -1,
			multiFileMessageModal: new ModalSet('multiFileMessageModal'),
			uploadbtnyn: false
		}
	},
	template:`
	<div>
	    <label class="label-type01" v-if="title">{{title}}</label>

	    <table class="file-upload-table">
	        <colgroup>
	            <col width="25%">
	            <col width="25%">
	            <col width="25%">
	            <col width="25%">
	        </colgroup>
	        <tbody>
	            <tr>
	                <th colspan="3">파일명</th>
	                <th>
						<button 
						    type="button" 
						    @click="$refs.fileInput.click()" 
						    class="btn type03 size-s"
							style="left:-2px;font-size:13px"
						>
						<span class="icon icon-plus"></span>
						파일추가
						</button>
					</th>
	            </tr>

	            <tr v-for="item in fileset.getFileList()" :key="item.FILE_NO">
	                <td colspan="4">
	                    <a href="javascript:void(0);" @click="fileset.download(item.FILE_ID, item.FILE_KEY, item.FILE_HANGMOK, item.FILE_NO, item.FILE_NM, item.FILE_PATH)" style="text-decoration: underline; cursor: pointer;">
	                        {{ item.FILE_NM }}
	                    </a>
	                </td>
	            </tr>

	            <tr v-for="(item, index) in fileset.getFileDataList()" :key="index">
	                <td colspan="4">{{ item.name }}</td>
	            </tr>
	        </tbody>
	    </table>

	    <input
	        type="file"
			ref="fileInput"
	        multiple
	        :accept="uploadExtension"
	        style="display:none;"
	        @change="fileCompChange($event.target)"
	    />
		<modal-message :modalset="multiFileMessageModal" v-on:callback="callback"></modal-message>
	</div>
	`,
	mounted: function() {
		this.fileset.fileId = this.fileid;
		this.fileset.fileHangmok = this.filehangmok;
	},
	//함수
	methods: {
		/**
		 * 파일 컴포넌트 변경 이벤트
		 * @param pTarget 파일 컴포넌트
		 * @return null
		 */
		fileCompChange: async function(pTarget){
			try{
				var files = pTarget.files;
				if(!isNull(this.uploadExtension)){
					if(this.uploadExtension.indexOf(this.getExtension(pTarget.files[0].name))<0){
						notifySubmit('warning', '파일 업로드', '업로드 가능한 확장자가 아닙니다.', 'icon-caution');
						return;
					}
				}
				var beforeFileDataCnt = this.fileset.fileData.length; //올릴예정 CNT
				var fileUpload = this.fileset.handleFileUpload(pTarget);
				var fileDataCnt = this.fileset.fileData.length; //올릴예정 CNT
				var fileListCnt = this.fileset.fileList.length; //올라간 CNT
				var currentFileCnt = files.length; //현재 시도하는 CNT
				var sumCnt = fileDataCnt+fileListCnt+currentFileCnt;

				if(fileUpload == -1){
					this.multiFileMessageModal.openModal('normal', '파일 업로드', '파일 업로드 가능한 최대 개수를\n초과하였습니다. ('+sumCnt+'/'+this.fileset.maxCnt+')', 'small', 'fileDelete');
				}

				this.onchange();
				
				try{
					if (files) {
						for(var i= 0; i < files.length; i++){
							var targetCnt = 0;
							await this.fileReader(files,i,beforeFileDataCnt);
						}
					}
				}catch(err){
					console.log('common getThumbnailPrivew() Error : '+err.message);
					return false;
				}

				return true;
			}catch(err){
				console.log('MultiFileTemplate.js fileCompChange() Error : '+err.message);
				return false;
			}
		},
		fileReader : async function (files,cnt,beforeFileDataCnt) {
			
			var reader = new FileReader();
			reader.onload = await function(e) {
				var imgid = '';
				
				if(beforeFileDataCnt<=0) imgid = '#uploadImgDiv' + cnt
				else imgid = '#uploadImgDiv' + (cnt+beforeFileDataCnt)

				$(imgid).append('<img src="' + e.target.result + '" border="0" alt="" />');
			}
			reader.readAsDataURL(files[cnt]);
		},
		callback: function(pGb, pId){
			try{

			}catch(err){
				console.log('MultiFileTemplate.js callback() Error : '+err.message);
				return false;
			}
		},
		onchange: function() {
			try{
				this.$emit('onchange');
			}catch(err){
				console.log('MultiFileTemplate.js callback() Error : '+err.message);
				return false;
			}
		},
		delFiles : function (pFileNo) {
			if(this.fileset.getFileCnt() > 0 || this.fileset.getFileDataCnt() > 0) {
				this.fileset.delTypes(this.fileid, this.filekey, this.filehangmok, pFileNo, null);
			}
		},
		delFileData : function (idx) {
			// console.log("key", idx);
			// document.getElementById('uploadImgDiv'+idx).style.display='none';
			this.fileset.fileData.splice(idx,1);
			this.fileset.progressText = '업로드 대기 : '+this.fileset.fileData.length+'개';
			this.fileset.calcFileCntPercentage();
			this.fileset.setFileCntUIInit();


		},
		keyMaker : function () {
			return crypto.randomUUID();
		},
		/**
		 * 파일이름에서 확장자명 추출
		 * @param fileName   파일 이름
		 * @return fileExtensiont 파일 확장자명
		 */
		getExtension: function(fileName){
			try{
				var fileLength = fileName.length;
				var lastDot = fileName.lastIndexOf('.');

				//substring 메서드는 start에서 end까지(end는 포함 안 함) 부분 문자열을 포함하는 문자열을 반환합니다.
				var fileExtension = fileName.substring(lastDot+1, fileLength);
				return fileExtension;
			}catch(err){
				console.log('MultiFileTemplate.js getExtension() Error : '+err.message);
				return false;
			}
		},
	}
});
