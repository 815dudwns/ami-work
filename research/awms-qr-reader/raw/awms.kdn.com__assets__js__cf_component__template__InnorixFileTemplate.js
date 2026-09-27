 /********************************************************************************************
 * @Writer
 *  김동진 2025.04.02
 *
 * @Description
 * 	Innorix 파일업로드 템플릿
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

Vue.component('innorix-file-uploader', {
	props: ['elementid', 'fileid'],
    data: function() {
		return {
			control: null,
        };
    },
    template: `
	<div>
		<div :id="elementid" style="display:none;"></div>
		<div :id="elementid+'preImg'" class="preview-zone"></div>
        <button type="button" class="btn type02 size-m camera" style="width:-webkit-fill-available;" @click="control.openFileDialogSingle()">
        	<span class="icon-camera"></span>
        </button>
	</div>
    `,
    mounted: function() {
		this.$nextTick(() => {
			this.initializeInnorix();
        });
    },
    methods: {
		initializeInnorix() {
			var self = this;
            if (typeof innorix === 'undefined') {
            	console.error('Innorix 라이브러리가 로드되지 않았습니다.');
                return;
            }

            const el = document.querySelector(`#${this.elementid}`);
            if (!el) {
                console.error(`#${this.elementid} 요소를 찾을 수 없습니다.`);
                return;
            }

            this.control = innorix.create({
                el: `#${this.elementid}`, 
                agent: false,
                installUrl: '../install/install.html',
                uploadUrl: '/upload.innorix',
                showPreviewImage: true,
				showTransferWindow: false,
                maxFileCount: 1,
            });

            // uploadFiles 호출 후 업로드 완료시
            this.control.on('uploadComplete', (p) => {
            	const f = p.files;
                let r = "Upload complete\n\n";
                for (let j = 0; j < f.length; j++) {
                	r += f[j].clientFileName + " " + f[j].fileSize + "\n";
                }
                console.log(r);
            });
			
			// 화면 ready 시 -> 신규가 아닌 기존 파일이 존재할시 setting 해줘야 preview가 보임
			this.control.on('loadComplete', function (p) { // 다운로드 파일 추가
				var urlBase = location.href.substring(0, location.href.lastIndexOf("/") + 1);
				console.log(urlBase);
				if(self.fileid){
				    self.control.presetDownloadFiles([
						{
					 		printFileName: `${self.fileid}.png`,
					        downloadUrl: `/download.innorix?fileID=${self.fileid}`
					     },
				 	]);
					//self.fnShowPreviewAll();
				}
			});
			/* 파일 첨부시 최대 갯수면 변경되지 않고 이벤트 에러로 빠짐 -> 단건의 경우 덮어씌울 수 있는지? 없다면 강제로 list 날리고 다시 넣어야 될듯
			this.control.on('addFileError', function (p){
				console.log('addFileError');
				console.log(p);
				console.log(p[0].type);
				
				if(p[0].type == 'maxFileCount'){
					self.control.removeAllFiles();
					console.log(self.control.fileList.files);
					self.control.fileList.files.push(p[0].file);
				}
				console.log('addFileError');
			});
			*/
			 
			//파일이 추가되고 나면 미리보기 생성 확장자 upcast?
			this.control.on('afterAddFiles', function (p) {
            	self.fnShowPreviewAll();
             	if(p[0].printFileName.includes(".png") || p[0].printFileName.includes(".jpg")){
             		console.log(p[0].rowID);	
             	}
            });
             // 생성된 컨트롤을 배열에 추가
             //this.controls[i] = control;
             
		},
		//이미지 미리보기 생성
		fnShowPreviewAll() {
			var self = this;
        	const f = self.control.getAllFiles(); // 첨부한 전체 파일 정보
            console.log(f);

            const previewAllZone = document.querySelector(`#${self.elementid}preImg`); // 동적 ID로 프리뷰 영역 찾기
            let imageCount = 0; // 이미지 로딩 카운터
            let totalImages = 0; // 총 이미지 수
            const blobUrls = []; // blob URL 추적

			for (let i = 0; i < f.length; i++) {
		        if (f[i].printFileName.includes(".png") || f[i].printFileName.includes(".jpg")) {
		            totalImages++;
		            const fileInfo = this.control.getFileById(f[i].rowID);
		            const blobSrc = fileInfo.file ? URL.createObjectURL(fileInfo.file) : fileInfo.downloadUrl;

		            // Blob URL인 경우에만 blobUrls에 추가
		            if (fileInfo.file) {
		                blobUrls.push(blobSrc);
		            }

		            const imgTag = document.createElement('img');
		            imgTag.onload = () => {
		                imageCount++;
		                if (imageCount === totalImages) {
		                    previewAllZone.style.display = 'block';
		                    blobUrls.forEach(url => URL.revokeObjectURL(url)); // Blob URL만 해제
		                }
		            };
		            imgTag.src = blobSrc;
		            previewAllZone.appendChild(imgTag);
		        }
		    }
        },
		//저장시... 단건으로 각각 저장시키는게 맞나..? control은 하나로 하고 el만 분리?
		uploadFiles() {
			return new Promise((resolve) => {
            	if (this.control && this.control.getFileCount() > 0) {
                	console.log(this.elementid + " Upload");
                    this.control.on('uploadComplete', (p) => {
                        resolve(p); // 업로드 완료 시 Promise 해결
                    });
                    this.control.upload();
                } else {
                    resolve(null); // 파일이 없으면 바로 해결
                }
			});
		},
     }
 });