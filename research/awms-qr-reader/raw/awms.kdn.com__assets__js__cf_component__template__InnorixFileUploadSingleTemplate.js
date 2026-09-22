/********************************************************************************************
 * @Writer
 *  백세민 2025.04.07
 *
 * @Description
 * 	이노릭스 단일 파일 업로드 템플릿
 *  기본 순서
 *    1. <innorix-file-upload-single :id="my-id" @callback="innorixFileUploadSingleCallback"></innorix-file-upload-single> 추가
 *    2. 촬영 버튼과 촬영한 이미지를 표시할 태그가 렌더링 된 이후 setCapturingWithImg(button, img) 호출
 *    3. 사용자 액션으로 촬영 버튼을 클릭/탭하여 사진 촬영 또는 파일 선택 동작 수행
 *    4. upload() 호출
 *    5. callback 에서 ATCH_FILE_ID, FILE_SN 수신
 *    6. 저장 등 업무 프로세스 처리
 *
 * @Syntax
 * 	<innorix-file-upload-single :id="my-id" @callback="innorixFileUploadSingleCallback"></innorix-file-upload-single>
 *
 * @Parameters
 *  id : 컴포넌트 ID
 *  callback : 파일 업로드 완료 또는 오류시 호출될 콜백 함수
 * 
 * @method
 *  setCapturingWithImg: 화면의 버튼과 이미지 태그 설정. 버튼 클릭 이벤트를 추가하여 모바일 환경에서 사진촬영/보관함선택 등 선택할 수 있고, 데스크탑 환경에서 파일 선택 다이얼로그 표시하는 클릭 이벤트를 설정함
 *                       촬영 또는 이미지 파일이 선택된 후 설정한 이미지 태그에 해당 이미지를 표시함
 *    parameters: button, img
 *                button: 클릭 이벤트를 설정할 button 태그의 ID값 또는 button 객체
 *                img: 촬영 또는 이미지 파일 선택 이후 해당 이미지가 표시될 img 태그의 ID값 또는 img 객체
 *  clear: 선택한 파일 제거.
 *    parameters: 없음
 *  upload: 선택한 파일 업로드. 업로드 완료/중지/오류 콜백 호출함
 *    parameters: 없음
 *    callback:
 *      parameters: capturingImgWithCameraInifo
 *        capturingImgWithCameraInifo.result.id: 컴포넌트 props의 id 값
 *        capturingImgWithCameraInifo.result.status: 업로드 결과. 업로드 완료시 "uploadComplete", 업로드 중지시 "uploadCancel", 업로드 오류시 "uploadError" 값을 가짐
 *        capturingImgWithCameraInifo.ATCH_FILE_ID: TM_ATCH_FILE 테이블의 ATCH_FILE_ID 값
 *        capturingImgWithCameraInifo.FILE_SN: TM_ATCH_FILE_DETAIL 테이블의 FILE_SN 값
 *        capturingImgWithCameraInifo.result.*: 업로드 결과 파일 정보
 *  isChanged: 촬영 또는 이미지 파일 선택이 수행되었는지 확인. 수행된 이후 true, 수행 전 false 리턴함
 *    paramters: 없음 
 ********************************************************************************************/

Vue.component("innorix-file-upload-single", {
	props: ["id"],
	data: function() {
		return {
            fileControl: new Object(),
            uploadUrl: "/upload.innorix",
            capturingImgWithCameraInifo: {
                isSet: false,
                buttonObject: null,
                inputObject: null,
                imgObject: null,
                isChanged: false,
                result: null,
            }
		}
	},
	template:`
        <div :id="'innorixFileUploadSingleFileControl_' + id" style="display: none;"></div>
	`,
	mounted: function() {
        this.init();
	},
	methods: {
		init: function() {
            const $this = this;
            this.fileControl = innorix.create({
                el: '#' + 'innorixFileUploadSingleFileControl_' + this.id, // 컨트롤 출력 HTML 객체 ID 12
                agent: false, // true = Agent 설치, false = html5 모드 사용
                installUrl: '../install/install.html', // Agent 설치 페이지
                uploadUrl: '/upload.innorix', // 업로드 URL
				allowExtension: ["png", "jpg", "jpeg", "gif", "bmp", "tiff", "webp", "svg", "ico", "heic"],
				showTransferWindow: false,
            });
            
            this.fileControl.on('uploadComplete', function (p) {
                var f = p.files;
                var r = "Upload complete\n\n";
                for (var i = 0; i < f.length; i++ ) {
                    r += f[i].clientFileName + " " + f[i].fileSize + "\n";
                }
                $this.capturingImgWithCameraInifo.result = f[0];
                $this.capturingImgWithCameraInifo.result.id = $this.id;
                $this.capturingImgWithCameraInifo.result.status = "uploadComplete";
                $this.capturingImgWithCameraInifo.isChanged = false;
                $this.$emit("callback", $this.capturingImgWithCameraInifo.result);
            });

            this.fileControl.on('uploadCancel', function (p) {
                console.log("uploadCancel");
                console.log(p);
                $this.capturingImgWithCameraInifo.result = p;
                $this.capturingImgWithCameraInifo.result.id = $this.id;
                $this.capturingImgWithCameraInifo.result.status = "uploadCancel";
                $this.$emit("callback", $this.capturingImgWithCameraInifo.result);
            });

            this.fileControl.on('uploadStart', function (p) {
                console.log("uploadStart");
                console.log(p);
            });

            this.fileControl.on('uploadError', function (p) {
                console.log("uploadError");
                console.log(p);
                $this.capturingImgWithCameraInifo.result = p;
                $this.capturingImgWithCameraInifo.result.id = $this.id;
                $this.capturingImgWithCameraInifo.result.status = "uploadError";
                $this.$emit("callback", $this.capturingImgWithCameraInifo.result);
            });
            
            this.fileControl.on("beforeAddFile", () => {
                $this.clear();
            });
            
            this.fileControl.on("afterAddFiles", (p) => {
                const file = $this.fileControl.fileList.getAllFiles()[0].file;
                const reader = new FileReader();
                reader.onload = function(e) {
                    $this.capturingImgWithCameraInifo.imgObject.src = e.target.result;
                }
                reader.readAsDataURL(file);
                $this.capturingImgWithCameraInifo.isChanged = true;
				$this.capturingImgWithCameraInifo.imgObject.parentElement.classList.add('ami-img-wrap');
            });
        },
        clear: function() {
            for(let i = 0; i < this.fileControl.getFileCount(); i++) {
                this.fileControl.removeFileByIndex(i);
            }
            this.capturingImgWithCameraInifo.isChanged = false;
        },
        upload: function() {
            if(this.capturingImgWithCameraInifo.isSet && this.capturingImgWithCameraInifo.isChanged) {
                this.fileControl.upload();
            }
        },
		setFileName: function(dataNum, instrNum, macModem){
			var p = this.fileControl.fileList.files;
			if(this.$parent.nameByField){
				console.log(p);
				var radio = this.$parent.radio?.replace("10","") || this.$parent.radioVal;
				var orgFileNm = p[0].clientFileName || p[0].file.name;
				var extension = orgFileNm.substring(orgFileNm.lastIndexOf('.') + 1);
				var repFileNm = (radio == 'D'?dataNum+'_':(instrNum + '(' + macModem + ')_')) + this.$parent.nameByField[radio][this.id] + '.' +extension;
				if(p[0].filePath) p[0].filePath = repFileNm;
				if(p[0].printFileName) p[0].printFileName = repFileNm;
				if(p[0].clientFileName) p[0].clientFileName = p[0].clientFileName.replace(orgFileNm, repFileNm);
				if(p[0].clientFilePath) p[0].clientFilePath = p[0].clientFilePath.replace(orgFileNm, repFileNm);
				p[0].file = new File([p[0].file], repFileNm, {
					type: p[0].file.type,
					lastModified: p[0].file.lastModified,
				});
			}
		},
        findOrCapture: async function() {
			this.createModal();
			const select = await this.openModalAndWait();
			if(select == 'camera'){
				//라이브러리에 임의추가 openFileDialogSingle과 동일동작하나 irx-hidden-input에 attr("capture","environment")를 추가한 함수
				this.fileControl.openFileDialogSingleMob();
			}else{
            	this.fileControl.openFileDialogSingle();
			}
        },
        setCapturingWithImg: function(button, img) {
            if(!(this.capturingImgWithCameraInifo.isSet)) {
                const buttonObject = (typeof button === "string") ? document.getElementById(button) : button;
                const imgObject = (typeof img === "string") ? document.getElementById(img) : img;
                buttonObject.addEventListener("click", this.findOrCapture);
                this.capturingImgWithCameraInifo.isSet = true;
                this.capturingImgWithCameraInifo.buttonObject = buttonObject;
                this.capturingImgWithCameraInifo.imgObject = imgObject;
            }
        },
        isChanged: function() {
            return this.capturingImgWithCameraInifo.isChanged;
        },
		
		createModal: function() {
		  // 최상위 래퍼
		  const modalLayerWrap = document.createElement('div');
		  modalLayerWrap.className = 'modal-layer-wrap';

		  // 모달
		  const modal = document.createElement('div');
		  modal.id = 'modal_selection';
		  modal.className = 'modal-layer modal-small';

		  // 컨테이너
		  const container = document.createElement('div');
		  container.className = 'modal-container';

		  // 헤더
		  const header = document.createElement('div');
		  header.className = 'modal-header';

		  const title = document.createElement('p');
		  title.className = 'modal-title';
		  title.textContent = '사진첨부';
		  header.appendChild(title);

		  // 콘텐츠
		  const content = document.createElement('div');
		  content.className = 'modal-content';

		  // 닫기
		  const btnR = document.createElement('div');
		  btnR.className = 'btn-r';
		  const aTag = document.createElement('a');
		  aTag.href = '#';
		  aTag.className = 'cbtn';
		  aTag.title = '모달창 닫기';
		  aTag.style.display = 'inline-block';
		  const span = document.createElement('span');
		  span.className = 'icon-exit';
		  aTag.appendChild(span);
		  btnR.appendChild(aTag);
		  
		  
		  const btnCamera = document.createElement('button');
		  btnCamera.id = 'camera';
		  btnCamera.className = 'btn type01 size-m width-full';
		  btnCamera.textContent = '사진촬영';

		  const btnAlbum = document.createElement('button');
		  btnAlbum.id = 'album';
		  btnAlbum.className = 'btn type01 size-m width-full';
		  btnAlbum.textContent = '앨범선택';

		  content.appendChild(btnR);
		  content.appendChild(btnCamera);
		  content.appendChild(btnAlbum);

		  // 계층 구조 조립
		  container.appendChild(header);
		  container.appendChild(content);
		  modal.appendChild(container);
		  modalLayerWrap.appendChild(modal);

		  // 문서에 추가
		  document.body.appendChild(modalLayerWrap);
		},
		openModalAndWait(){
			return new Promise((resolve) => {
		        modal_open('modal_selection');

		        const cameraBtn = document.querySelector("#camera");
		        const albumBtn = document.querySelector("#album");
		        cameraBtn.onclick = () => {
		            modal_close('modal_selection');
					document.querySelector('#modal_selection').parentElement.remove();
		            resolve('camera');
		        };
		        albumBtn.onclick = () => {
		            modal_close('modal_selection');
					document.querySelector('#modal_selection').parentElement.remove();
		            resolve('album');
		        };
		    });
		},
	}
});
