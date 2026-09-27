/********************************************************************************************
 * @Writer
 *  박해수 2019.01.26
 *
 * @Description
 * 	파일업로드 템플릿
 *
 * @Syntax
 *  $.get('/assets/cf_component/template/SingleFileTemplate.html', function(response){
 *		$('head').append(response); 
 *	});
 * 	<single-file-uploader :fileset="Fileset" :type="'img'" v-on:exceluploadcallback="testcallback"></single-file-uploader>
 *
 * @Parameters
 *  fileset : FileSet => file: new FileSet(pSetUrl, pGetUrl, pDelUrl, pUploadPath, pMaxCnt),
 *  type : file, img
 *  filekey : 키 조합(여러개 키를 합칠 경우 #으로 붙임)
 ********************************************************************************************/

Vue.component('single-file-uploader', {
		props: ['fileset', 'type', 'fileid', 'filekey', 'filehangmok', 'modify', 'realdelyn', 'uploadExtension'],
	data: function() {
		return {
			fileName: '',
			singleFileMessageModal: new ModalSet('singleFileMessageModal'),
			excelPlaceholder: '',
			messagePopupTF: false,
			mainListLoading: {
				id: 'mainListLoading',
				val: false
			},
			delTargetFile: {}
		};
	},
	template: `
		<div class="form-group" v-if="type == 'file'">
			<div class="input-file-box" v-if="fileset.getFileCnt() == 0" :ref="'mainListLoading'+fileid+filekey+filehangmok">
				<div class="file-input-div">
					<a href="#!" class="btn type02 size-m" v-if="modify"><span>찾아보기</span></a>
					<input type="file" class="file-input-hidden size-m" @change="fileCompChange($event.target)" title="파일명" :accept="uploadExtension">
				</div>
				<input id="fileName" class="size-m" readonly="readonly"  title="파일명" :placeholder="fileset.progressText">
			</div>
			<div class="file-upload-type" v-else="fileset.getFileCnt() != 0" style="border:0px; padding: 0px;" >
				<div class="upload-list">
			        <div class="list-box" style="height:auto; overflow-y:hidden; margin:0px;">
			            <div class="list-line" v-for="(item, index) in fileset.getFileList()" v-if="index == 0">
			                <span class="file-type">{{getExtension(item.FILE_NM)}}</span>
			                <span class="sel-text">{{item.FILE_NM}}</span>
			                <span class="file-size">{{item.FILE_SIZE > 1000 ? (item.FILE_SIZE/1024).toFixed(2)+'MB' : item.FILE_SIZE+'KB'}}</span>
			                <span class="icon-download"><a href="#!" @click="fileset.download(item.FILE_ID, item.FILE_KEY, item.FILE_HANGMOK, item.FILE_NO, item.FILE_NM, item.FILE_PATH)"></a></span>
			                <span class="icon-close" v-if="modify"><a href="#!" @click="fileDelete()"></a></span>
			       	 	</div>
			        </div>
			    </div>
			</div>
			<modal-message :modalset="singleFileMessageModal" v-on:callback="callback"></modal-message>
		</div>
		
		<div class="form-group" v-else-if="type == 'img'">
			<div :id="fileid+'_'+filekey+'_'+filehangmok" class="photo-add-wrap">
				<div class="photo-box" :ref="'mainListLoading'+fileid+filekey+filehangmok">
					<div id="photo_image" v-if="fileset.getFileCnt() != 0">
						<img :id="fileid + filehangmok + 'singleImg'" :src="'/upload'+item.FILE_PATH" border="0" alt="" v-for="(item, index) in fileset.getFileList()" v-if="index == 0" />
					</div>
					<!--<div class="progress simple horizontal" v-else>
                        <div class="area">
                            <div :class="{bar:'bar',striped:fileset.striped,animated:'animated'}" style="width: 0%;" :style="{width:fileset.uploadPercentage+'%'}"></div>
                        </div>
                    </div>-->
				</div>
				<div class="btn-photo" :for="'cma_file'+filehangmok" v-if="modify">
					<label :for="'cma_file' + '_' + fileid + '_' + filekey + '_' + filehangmok">사진등록</label>
					<input type="file" :accept="uploadExtension" :name="'cma_file' + '_' + fileid + '_' + filekey + '_' + filehangmok" :id="'cma_file' + '_' + fileid + '_' + filekey + '_' + filehangmok" accept="image/*" capture="camera" @change="fileCompChange($event.target);getThumbnailPrivew($event.target,fileid+filehangmok+'singleImg')" />
				</div>
				<a href="#!" class="btn-del-photo" v-if="modify" v-show="filekey" :class="{'disabled':(fileset.getFileCnt() == 0 && fileset.getFileDataCnt() == 0)}"><span class="icon icon-minus2" @click="fileDelete()">사진삭제</span></a>
			</div>
			<modal-message :modalset="singleFileMessageModal" v-on:callback="callback"></modal-message>
		</div>
		
		<div class="form-group" v-else-if="type == 'excel' && modify">
			<div class="input-file-box" :ref="'mainListLoading'+fileid+filekey+filehangmok">
				<div class="file-input-div">
					<a href="#!" class="btn type02 size-m" v-if="modify"><span>찾아보기</span></a>
					<input v-if="fileset.getFileCnt() == 0" type="file" :accept="uploadExtension" class="file-input-hidden size-m" @change="excelFileCompChange($event.target)" title="파일명" >
				</div>
				<input id="fileName" class="size-m" readonly="readonly"  title="파일명" :placeholder="excelPlaceholder">
			</div>
			<modal-message :modalset="singleFileMessageModal" v-on:callback="callback"></modal-message>
		</div>
	`,
	watch: {
		'fileset.uploadPercentage': {
			handler: function(val, oldVal) {
				if(val > 0) {
					if(this.fileset.getFileCnt() == 0) {
						this.mainListLoading.val = true;
					}
				}
			}
		},
		'fileset.fileList': {
			handler: function(val, oldVal) {
				if(this.fileset.getFileCnt() > 0) {
					this.mainListLoading.val = false;
				}
			}
		},
		'mainListLoading.val': {
			handler: function(val, oldVal) {
				this.LoadingOverlay(this.$refs['mainListLoading' + this.fileid + this.filekey + this.filehangmok], val);
			}
		}
	},
	mounted: function() {
		this.fileset.fileId = this.fileid;
		this.fileset.fileHangmok = this.filehangmok;
		console.log(this.fileid);
		console.log(this.filehangmok);
		console.log(this.filekey);
	}, //함수
	methods: {
		fileCompChange(pTarget) {
			this.fileset.dataInit();

			if(this.fileset.getFileCnt()>0){
				this.fileset.delTypes(this.fileid, this.filekey, this.filehangmok, null, null);
			}
			
			if(_.size(this.delTargetFile) > 0) {
				this.fileset.delFiles(this.delTargetFile.fileid, this.delTargetFile.filekey, this.delTargetFile.filehangmok, null, null);
			}

			if(!isNull(this.uploadExtension)){
				if(this.uploadExtension.indexOf(this.getExtension(pTarget.files[0].name))<0){
					notifySubmit('warning', '파일 업로드', '업로드 가능한 확장자가 아닙니다.', 'icon-caution');
					// this.singleFileMessageModal.openModal('normal', '파일 업로드', '파일 업로드 가능한 확장자가 아닙니다.', 'small', 'fileUploadExtension');
					return
				}
			}

			var fileUpload = this.fileset.handleFileUpload(pTarget, this.fileid, this.filekey, this.filehangmok);
			var fileDataCnt = this.fileset.fileData.length; //올릴예정 CNT
			var fileListCnt = this.fileset.fileList.length; //올라간 CNT
			var currentFileCnt = 1; //현재 시도하는 CNT
			var sumCnt = fileDataCnt + fileListCnt + currentFileCnt;

			this.fileName = pTarget.value;
			if(fileUpload == -1) {
				this.singleFileMessageModal.openModal('normal', '파일 업로드', '파일 업로드 가능한 최대 개수를\n초과하였습니다. (' + sumCnt + '/' + this.fileset.maxCnt + ')', 'small', 'fileDelete');
			} else {
				this.$emit('uploadcallback', fileUpload);
				this.$forceUpdate();
			}
		},
		excelFileCompChange(pTarget) {
			if(_.size(this.delTargetFile) > 0) {
				this.fileset.delFiles(this.delTargetFile.fileid, this.delTargetFile.filekey, this.delTargetFile.filehangmok, this.delTargetFile.fileno, this.delTargetFile.row);
			}

			var returnData = this.fileset.excelFileUpload(pTarget);
			var self = this;

			returnData.then(function(response) {
				var data = response.data.file1;

				if(isNull(data)) self.excelPlaceholder = '엑셀업로드 실패'; else self.excelPlaceholder = '업로드 완료';
				self.mainListLoading.val = false;
				self.$emit('exceluploadcallback', data);
			}).catch(function(error) {
				console.error('error:', error);
			});
		},

		getThumbnailPrivew : function(target,singleImgId) {
			var self = this;
			try{
				if (target.files && target.files[0]) {
					var reader = new FileReader();
					var photoboxkey= '#' + self.fileid+'_'+self.filekey+'_'+self.filehangmok;
					console.log(photoboxkey);
					reader.onload = function(e) {
						$(photoboxkey + ' .photo-box').css('display', 'block');
						$(photoboxkey + ' .photo-box').html('<img id="'+singleImgId+'" src="' + e.target.result + '" border="0" alt="" />');
					}
					reader.readAsDataURL(target.files[0]);
				}
			}catch(err){
				console.log('common getThumbnailPrivew() Error : '+err.message);
				return false;
			}
		},
		fileDelete() {
			if(this.fileset.getFileCnt() > 0 || this.fileset.getFileDataCnt() > 0) {

				this.fileset.delTypes(this.fileid, this.filekey, this.filehangmok, null, null);

				var imgId = this.fileid+this.filehangmok+'singleImg'

				if (!isNull(document.getElementById(imgId)) && this.type=='img') {
					document.getElementById(imgId).remove();
				}

				if($('#cma_file' + '_' + 'TEMP_DATA' + '_' + '1' + '_' + 'file').length > 0){
					$('#cma_file' + '_' + 'TEMP_DATA' + '_' + '1' + '_' + 'file')[0].type = '';
					$('#cma_file' + '_' + 'TEMP_DATA' + '_' + '1' + '_' + 'file')[0].type = 'file';
				}
			}
		},
		delFiles(pFileId, pFileKey, pFileHangmok, pFileNo, nRow) {
			this.delTargetFile = {
				'fileid': pFileId,
				'filekey': pFileKey,
				'filehangmok': pFileHangmok,
				'fileno': pFileNo,
				'row': nRow
			};
			this.fileset.fileList = [];
			this.$emit('filedelcallback', {
				'pFileId': pFileId,
				'pFileKey': pFileKey,
				'pFileHangmok': pFileHangmok,
				'pFileNo': pFileNo,
				'nRow': nRow
			});
		},
		callback(pGb, pId) {

		},
		/**
		 * 파일이름에서 확장자명 추출
		 * @param fileName   파일 이름
		 * @return fileExtensiont 파일 확장자명
		 */
		getExtension: function(fileName) {
			try {
				var fileLength = fileName.length;
				var lastDot = fileName.lastIndexOf('.');

				//substring 메서드는 start에서 end까지(end는 포함 안 함) 부분 문자열을 포함하는 문자열을 반환합니다.
				var fileExtension = fileName.substring(lastDot + 1, fileLength);
				return fileExtension;
			} catch(err) {
				console.log('MultiFileTemplate.js getExtension() Error : ' + err.message);
				return false;
			}
		}
	}
});
