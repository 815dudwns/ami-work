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

Vue.component('file-uploader', {
	props: ['fileset', 'type', 'fileid', 'filekey', 'filehangmok', 'title', 'modify', 'floatnone', 'imgwidth', 'uploadbtn','uploadExtension'],
	data: function(){
		return{
			mouseOver: -1,
			mouseOver2: -1,
			multiFileMessageModal: new ModalSet('multiFileMessageModal'),
			uploadbtnyn: true
		}
	},
	template:`
		<div class="form-group">
			<label for="exampleFormControlInput1" class="label-type01">{{title}}</label>
	        <div class="file-upload-type" :class="{'pd-none':floatnone}">
	            <div class="upload-viewer" v-if="modify" :class="{'float-none':floatnone}">
	                <span class="circlechart-text01">{{fileset.getFileCurrentCnt()}}</span><span class="circlechart-text02">{{fileset.maxCnt}}</span>
	                <div class="circlechart"></div>
	                <div class="info-text">파일을 <span>드래그 앤 드롭</span> 하거나 파일찾기를 눌러 선택한 후 업로드하세요</div>
<!--	                <div class="info-text" v-show="!filekey">저장 후 <span>파일 등록을</span> 하실 수 있습니다.</div>-->
	                <div class="btn-line">
	                	<input type="button" value="파일찾기" onclick="$('#files').click();" class="btn type01 size-m">
	                	<input v-if="uploadbtnyn" type="button" :disabled="!filekey" value="업로드" class="btn type02 size-m" @click="fileset.uploadFile(fileid, filekey, filehangmok)">
					</div>
	                <div class="progress-zone">
	                    <div class="percent">{{fileset.uploadPercentage}}%</div>
	                    <div class="statue-txt">{{fileset.progressText}}</div>
	                    <div class="progress simple horizontal">
	                        <div class="area">
	                            <div :class="{bar:'bar',striped:fileset.striped,animated:'animated'}" style="width: 0%;" :style="{width:fileset.uploadPercentage+'%'}"></div>
	                        </div>
	                    </div>
	                </div>
	                <input :disabled="!filekey" type="file" :accept="uploadExtension" id="files" multiple @change="fileCompChange($event.target)" @drop="fileset.handleFileUpload($event.target); fileset.handleDragLeave($event.target);" @dragover="fileset.handleDragOver($event.target)" @dragleave="fileset.handleDragLeave($event.target)" />
	            </div>
	            <div class="upload-list" :class="{'float-none':floatnone}">
	                <span class="tit">파일목록</span>
	                <span class="total">Total <span>{{fileset.getFileCnt()}}</span></span>
                	<perfect-scrollbar class="list-box">
                	
	                    <div class="list-line-photo" v-show="type == 'img'" v-for="(item, index) in fileset.getFileList()" @mouseover="mouseOver = index" @mouseleave="mouseOver = -1" :style="{'width':imgwidth+'px'}">
	                    	<transition name="fade">
		                        <div class="hidden-layer" v-if="mouseOver == index" :style="{'width':imgwidth+'px'}">
		                            <div class="btn-box">
		                                <a href="#!" v-if="modify"><span class="icon icon-close" @click="delFiles(item.FILE_NO)"></span></a>
		                                <a href="#!"><span class="icon icon-download" @click="fileset.download(item.FILE_ID, item.FILE_KEY, item.FILE_HANGMOK, item.FILE_NO, item.FILE_NM, item.FILE_PATH)"></span></a>
		                            </div>
		                        </div>
	                        </transition>
	                        <img :src="'/upload'+item.FILE_PATH" alt="item.FILE_NM" :style="{'width':imgwidth+'px'}"/>
	                    </div>
	                    
	                    <div :id="'uploadImgDiv'+index" class="list-line-photo" v-show="type == 'img'" v-for="(item, index) in fileset.getFileDataList()" :key="item.fileKey" @mouseover="mouseOver2 = index" @mouseleave="mouseOver2 = -1" :style="{'width':imgwidth+'px'}">
	                    	<transition name="fade">
		                        <div class="hidden-layer" v-if="mouseOver2 == index" :style="{'width':imgwidth+'px'}">
		                            <div class="btn-box">
		                                <a href="#!" v-if="modify"><span class="icon icon-close" @click="delFileData(index)"></span></a>
		                            </div>
		                        </div>
	                        </transition>
	                    </div>
	                    <div class="list-line" v-if="type == 'list'" v-for="(item, index) in fileset.getFileList()" :style="{'background-color' : item.ROW_TYPE =='8'? 'rgba(155, 0, 0, 0.3)':''}">
	                        <span class="file-type">{{getExtension(item.FILE_NM)}}</span>
	                        <span class="sel-text">{{item.FILE_NM}}</span>
	                        <span class="file-size">{{item.FILE_SIZE > 1000 ? (item.FILE_SIZE/1024).toFixed(2)+'MB' : item.FILE_SIZE+'KB'}}</span>
	                        <span class="icon-download"><a href="#!" @click="fileset.download(item.FILE_ID, item.FILE_KEY, item.FILE_HANGMOK, item.FILE_NO, item.FILE_NM, item.FILE_PATH)"></a></span>
	                        <span class="icon-close" v-if="modify"><a href="#!" @click="delFiles(item.FILE_NO); onchange()"></a></span>
                   	 	</div>
                   	 	<div class="list-line" v-if="type == 'list'" v-for="(item, index) in fileset.getFileDataList()" style="background-color : rgba(0,255,0,0.3)">
	                        <span class="file-type">{{getExtension(item.name)}}</span>
	                        <span class="sel-text">{{item.name}}</span>
	                        <span class="file-size">{{item.size > 1000 ? (item.size/1024).toFixed(2)+'MB' : item.size+'KB'}}</span>
<!--	                        <span class="icon-download"><a href="#!" @click="fileset.download(item.FILE_ID, item.FILE_KEY, item.FILE_HANGMOK, item.FILE_NO, item.FILE_NM, item.FILE_PATH)"></a></span>-->
	                        <span class="icon-close" v-if="modify"><a href="#!" @click="delFileData(index); onchange()"></a></span>
                   	 	</div>
               	 	</perfect-scrollbar>
	            </div>
	        </div>
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
