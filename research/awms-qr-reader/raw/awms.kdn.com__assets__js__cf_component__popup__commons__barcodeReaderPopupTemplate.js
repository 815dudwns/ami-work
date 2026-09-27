/********************************************************************************************
 * @Writer 
 *  백세민 2025. 02. 17. 
 *  
 * @Description
 *  Barcode Reader (1D/2D)
 * 
 * @Syntax
 *  <barcode-reader ref="barcodeReader" id="mobemr1000_barcode_reader" title="계기" @callback="receiveBarcode"></barcode-reader>
 *
 * @Parameters
 *
 ********************************************************************************************/

Vue.component('barcode-reader', {
    props: ['id', 'title'],
    data: function() {
        return {
            readValue: "", // 결과 값. QR, 바코드 모두 이 값으로 결과를 저장함. 호출자에게 전달함.
            rawValue: "", // QR 인식 텍스트
            codeReader: null, // 바코드 리더 객체. ZXing
            currentStream: null, // 비디오 스트림
            modalBackground: null, // 모달 외곽 div
            pictureInput: null, // 사진 선택(촬영)을 위한 input tag
            pictureSelectViewImg: null, // 사진 선택(촬영) 후 선택한 이미지를 화면으로 보기 위한 img 태그
            video: null, // video 태그
            isOcrProcessing: false, // OCR 시도 중일 때 true
            isDone: false, // 인식이 완료되면 true. 모든 동작 여부는 isDone가 false 인 경우에만 동작 가능
            barcodeType: "", // "1d" 바코드 또는 "2d" QR코드
            zoomStatus: "unknwon",
            zoomMinValue: 0,
            zoomMaxValue: 0,
            zoomCurrentValue: 0,
            backCameraDeviceId: null,
            readerMethod: "zxing",
			prdcYm: "", //계기번호 인식 시 제조년월 값
			actionHistory: {
			    uuid: "",
				type: "",
			    userId: "",
				deviceModel: "",
			    startTimeStamp: 0,
			    tryHistory: [
			        {captureTimeStamp: 0, sendTimeStamp: 0, receviceTimeStamp: 0, warebizKdata: "", warebizTime: "", wasStartTimeStamp: 0, wasEndTimeStamp: 0}
			    ],
			},
			isZXingPaused: false,
        }
    },
    template: `
     `,
    //마운트 된 시점수행
    mounted: function() {
        this.initReader();
    },
    //함수
    methods: {
        initReader: function() {
            this.codeReader = new ZXing.BrowserMultiFormatReader();
        },
        stopCamera: function() {
            if (this.currentStream) {
                this.currentStream.getTracks().forEach((track) => track.stop()); // 카메라 종료
                this.currentStream = null; // 스트림 초기화
            }
            this.codeReader.stopStreams();
        },
        /**
         * 현재 기기가 스마트폰인지 확인하는 함수
         * @returns {boolean} 스마트폰이면 true, 아니면 false
         */
        isMobileDevice: function() {
            return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        },
        /**
         * 후면 카메라 ID를 가져오는 함수 (스마트폰에서 후면 카메라 강제 선택)
         * @returns {Promise<string>} 후면 카메라의 deviceId
         */
        getBackCameraId: async function() {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const deviceIdArray = [];
            devices.forEach(device => {
                if(device.kind == "videoinput" && (device.label.toLowerCase().includes("back")) || device.label.toLowerCase().includes("후면")) {
                    deviceIdArray.push(device.deviceId);
                }
            });
            let deviceId = null;
            if(navigator.userAgent.toLowerCase().includes("iphone") || navigator.userAgent.toLowerCase().includes("ipad")) {
                deviceId = deviceIdArray[0];
            }
            else if(navigator.userAgent.toLowerCase().includes("android")) {
                deviceId = deviceIdArray[deviceIdArray.length - 1];
            }
            return deviceId;
        },
        /**
         * 입력값이 없는 경우 빈 문자열 설정. 입력값이 있는 경우 입력 값 설정 및 종료.
         */
        setReadValueThenClose: async function(input) {
			let { value, value2 } = typeof input === 'string' ? { value: input } : input || {};
            if(value) {
                this.readValue = value;
				if(value2 !== undefined){
					this.prdcYm = value2;
				}
				axios.post("/ami/mob/emr/api-warebiz-ocr-history",  this.actionHistory, {"Content-Type": "application/json"});
                this.closeBarcodeScanner();
                this.$emit("callback"); // 콜백
            }
            else {
                this.readValue = "";
				this.prdcYm = "";
            }
        },
        /**
         * 카메라 종료, 모달 창 제거
         */
        closeBarcodeScanner: function() {
            this.stopCamera();
            this.isDone = true;
            if(this.modalBackground) {
                this.modalBackground.remove(); // 모달 팝업 제거
            }
        },
        /**
         * 카메라 사용 허용
         */
        requestCameraPermission: async function() {
            try {
                const constraints = {video: true, audio: false};
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                if(stream) {
                    const tracks = stream.getTracks();
                    tracks.forEach(track => track.stop());
                }
            } catch (error) {
                console.log(error);
				notifySubmit('error', '권한없음', '카메라 권한이 없습니다. 권한을 허용 후 재시도 해주세요', 'icon-caution');
                throw error;
            }
        },
        /**
         * 모달 팝업의 모든 HTML 엘리먼트 생성
         */
        createModalView: function() {
            if(this.modalBackground) {
                this.modalBackground.remove();
                this.modalBackground = null;
            }
            // 팝업(모달) 배경 생성
            this.modalBackground = document.createElement("div");
            this.modalBackground.style.position = "fixed";
            this.modalBackground.style.top = "-30px";
            this.modalBackground.style.left = "0";
            this.modalBackground.style.width = "100vw";
            this.modalBackground.style.height = "100vh";
            this.modalBackground.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
            this.modalBackground.style.display = "flex";
            this.modalBackground.style.justifyContent = "center";
            this.modalBackground.style.alignItems = "center";
            this.modalBackground.style.zIndex = "1000";
            // 팝업 컨테이너 생성
            const modalContainer = document.createElement("div");
            modalContainer.style.background = "white";
            modalContainer.style.padding = "3px";
            modalContainer.style.borderRadius = "10px";
            modalContainer.style.textAlign = "center";
            modalContainer.style.width = "100%";
            //modalContainer.style.maxWidth = "400px";
            modalContainer.style.display = "flex";
            modalContainer.style.flexDirection = "column";
            modalContainer.style.alignItems = "center";
            modalContainer.style.position = "relative";
            modalContainer.style.boxShadow = "0px 4px 10px rgba(0, 0, 0, 0.3)";
            modalContainer.style.zIndex = "1001";
            // 비디오 요소 생성 (여기서 미리 생성하여 DOM에 추가)
            const video = document.createElement("video");
            video.id = "barcode-scanner-video";
            video.style.width = "100%";
            video.style.maxWidth = "100%";
            video.style.height = "auto";
            video.style.maxHeight = "50vh";
            video.style.marginBottom = "40px"
            video.style.borderRadius = "10px";
            video.style.objectFit = "cover";
            video.style.zIndex = "1002";
            video.autoplay = true;
            video.playsInline = true; // iOS에서 전체 화면 방지
            this.video = video;
            modalContainer.appendChild(video);
            // 닫기 버튼 생성
            const closeButton = document.createElement("button");
            closeButton.textContent = "닫기";
            closeButton.style.position = "absolute";
            closeButton.style.top = "calc(100% - 37px)";
            closeButton.style.right = "5px";
            closeButton.style.background = "#ff5f5f";
            closeButton.style.border = "none";
            closeButton.style.color = "white";
            closeButton.style.padding = "5px 10px";
            closeButton.style.fontSize = "20px";
            closeButton.style.cursor = "pointer";
            closeButton.style.borderRadius = "5px";
            closeButton.style.zIndex = "1004";
            closeButton.addEventListener("mouseover", function() {this.style.background = "#ff3f3f";});
            closeButton.addEventListener("mouseout", function() {this.style.background = "#ff5f5f";});
            closeButton.addEventListener("click", this.closeScanner); // 닫기 버튼 클릭 시 팝업 닫기
            modalContainer.appendChild(closeButton);
            // 사진 선택 버튼 생성
			/*
            const pictureSelectButton = document.createElement("button");
            pictureSelectButton.textContent = "사진선택";
            pictureSelectButton.style.position = "absolute";
            pictureSelectButton.style.top = "calc(100% - 37px)";
            pictureSelectButton.style.left = "5px";
            pictureSelectButton.style.background = "#76ad5f";
            pictureSelectButton.style.border = "none";
            pictureSelectButton.style.color = "white";
            pictureSelectButton.style.padding = "5px 10px";
            pictureSelectButton.style.fontSize = "20px";
            pictureSelectButton.style.cursor = "pointer";
            pictureSelectButton.style.borderRadius = "5px";
            pictureSelectButton.style.zIndex = "1004";
            pictureSelectButton.addEventListener("mouseover", function() {this.style.background = "#4e9131";}); //78 145 49
            pictureSelectButton.addEventListener("mouseout", function() {this.style.background = "#76ad5f";});
            pictureSelectButton.addEventListener("click", () => {document.getElementById("picture-input").click();});
            modalContainer.appendChild(pictureSelectButton);
            // 사진 선택 input 생성
            const pictureInput = document.createElement("input");
            pictureInput.type = "file";
            pictureInput.id = "picture-input";
            pictureInput.accept = "image/*";
            pictureInput.style.display = "none";
            pictureInput.addEventListener("change", this.pictureSelect);
            modalContainer.appendChild(pictureInput);
            this.pictureInput = pictureInput;
            // 사진 선택 후 보여줄 img 생성
            const pictureSelectViewImg = document.createElement("img");
            pictureSelectViewImg.id = "picture-sselect-view-img";
            pictureSelectViewImg.style.width = "100%";
            pictureSelectViewImg.style.maxWidth = "100%";
            pictureSelectViewImg.style.height = "auto";
            pictureSelectViewImg.style.maxHeight = "300px";
            pictureSelectViewImg.style.borderRadius = "10px";
            pictureSelectViewImg.style.display = "none";
            pictureSelectViewImg.style.zIndex = "1003";
            this.pictureSelectViewImg = pictureSelectViewImg;
            modalContainer.appendChild(pictureSelectViewImg);
			*/
            // 축소 버튼 추가
            const zoomOutButton = document.createElement("button");
            zoomOutButton.id = "zoomOutButton";
            zoomOutButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-zoom-out" viewBox="0 0 16 16">'
                + '<path fill-rule="evenodd" d="M6.5 12a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11M13 6.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0"/>'
                + '<path d="M10.344 11.742q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1 6.5 6.5 0 0 1-1.398 1.4z"/>'
                + '<path fill-rule="evenodd" d="M3 6.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5"/>'
                + '</svg>';
            zoomOutButton.style.position = "absolute";
            zoomOutButton.style.top = "calc(100% - 34px)";
            zoomOutButton.style.left = "110px";
            zoomOutButton.style.background = "rgba(0, 0, 0, 0)";
            zoomOutButton.style.border = "none";
            zoomOutButton.style.color = "#666";
            zoomOutButton.style.fontSize = "20px";
            zoomOutButton.style.cursor = "pointer";
            zoomOutButton.style.zIndex = "1004";
            zoomOutButton.style.display = "none";
            zoomOutButton.addEventListener("click", this.zoomOut);
            modalContainer.appendChild(zoomOutButton);
            // 확대/축소 막대기 배경 추가
            const zoomBarBackground = document.createElement("div");
            zoomBarBackground.id = "zoomBarBackground";
            zoomBarBackground.style.position = "absolute";
            zoomBarBackground.style.top = "calc(100% - 31px)";
            zoomBarBackground.style.left = "134px";
            zoomBarBackground.style.width = "calc(100% - 230px)";
            zoomBarBackground.style.maxWidth = "calc(100% - 230px)";
            zoomBarBackground.style.height = "17px";
            zoomBarBackground.style.background = "#939393";
            zoomBarBackground.style.border = "none";
            zoomBarBackground.style.color = "#140f0f";
            zoomBarBackground.style.fontSize = "13px";
            zoomBarBackground.style.paddingTop = "2px";
            zoomBarBackground.style.borderRadius = "3px";
            zoomBarBackground.style.zIndex = "1004";
            zoomBarBackground.style.display = "none";
            modalContainer.appendChild(zoomBarBackground);
            // 확대/축소 막대기 추가
            const zoomBarForeground = document.createElement("div");
            zoomBarForeground.id = "zoomBarForeground";
            zoomBarForeground.style.position = "absolute";
            zoomBarForeground.style.top = "calc(100% - 31px)";
            zoomBarForeground.style.left = "134px";
            zoomBarForeground.style.width = "calc((100% - 230px) * 0.1)";
            zoomBarForeground.style.maxWidth = "calc((100% - 230px) * 0.1)";
            zoomBarForeground.style.height = "17px";
            zoomBarForeground.style.background = "rgba(0, 14, 183, 0.35)";
            zoomBarForeground.style.border = "none";
            zoomBarForeground.style.color = "#666";
            zoomBarForeground.style.fontSize = "20px";
            zoomBarForeground.style.borderRadius = "3px";
            zoomBarForeground.style.zIndex = "1005";
            zoomBarForeground.style.display = "none";
            modalContainer.appendChild(zoomBarForeground);
            // 확대 버튼 추가
            const zoomInButton = document.createElement("button");
            zoomInButton.id = "zoomInButton";
            zoomInButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-zoom-in" viewBox="0 0 16 16">'
                + '<path fill-rule="evenodd" d="M6.5 12a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11M13 6.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0"/>'
                + '<path d="M10.344 11.742q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1 6.5 6.5 0 0 1-1.398 1.4z"/>'
                + '<path fill-rule="evenodd" d="M6.5 3a.5.5 0 0 1 .5.5V6h2.5a.5.5 0 0 1 0 1H7v2.5a.5.5 0 0 1-1 0V7H3.5a.5.5 0 0 1 0-1H6V3.5a.5.5 0 0 1 .5-.5"/>'
                + '</svg>';
            zoomInButton.style.position = "absolute";
            zoomInButton.style.top = "calc(100% - 34px)";
            zoomInButton.style.left = "calc(100% - 90px)";
            zoomInButton.style.background = "rgba(0, 0, 0, 0)";
            zoomInButton.style.border = "none";
            zoomInButton.style.color = "#666";
            zoomInButton.style.fontSize = "20px";
            zoomInButton.style.cursor = "pointer";
            zoomInButton.style.zIndex = "1004";
            zoomInButton.style.display = "none";
            zoomInButton.addEventListener("click", this.zoomIn);
            modalContainer.appendChild(zoomInButton);

            // 인식방법 버튼
            if(this.barcodeType == "1d") {
                const methodTitleBox = document.createElement("div");
                methodTitleBox.style.position = "absolute";
                methodTitleBox.style.top = "1rem";
                methodTitleBox.style.left = "1.1rem";
                methodTitleBox.style.border = "none";
                methodTitleBox.style.borderRadius = "16px";
                methodTitleBox.style.backgroundColor = "#ffffff11";
                methodTitleBox.style.width = "32%";
                methodTitleBox.style.maxWidth = "32%";
                methodTitleBox.style.height = "30px";
                methodTitleBox.textContent = "인식방법선택";
                methodTitleBox.style.textAlign = "center";
                methodTitleBox.style.color = "black";
                methodTitleBox.style.padding = "5px 10px";
                methodTitleBox.style.fontSize = "18px";
                methodTitleBox.style.zIndex = "1005";
                modalContainer.appendChild(methodTitleBox);
                const methodOcrBox = document.createElement("a");
                methodOcrBox.style.position = "absolute";
                methodOcrBox.style.top = "1rem";
                methodOcrBox.style.left = "calc(1.1rem + 35%)";
                methodOcrBox.style.border = "none";
                methodOcrBox.style.borderRadius = "16px";
                methodOcrBox.style.backgroundColor = "#595959";
                methodOcrBox.style.width = "27%";
                methodOcrBox.style.maxWidth = "27%";
                methodOcrBox.style.height = "30px";
                methodOcrBox.textContent = "OCR 활용";
                methodOcrBox.style.textAlign = "center";
                methodOcrBox.style.color = "white";
                methodOcrBox.style.padding = "5px 10px";
                methodOcrBox.style.fontSize = "18px";
                methodOcrBox.style.zIndex = "1005";
                methodOcrBox.id = "method-ocr-box";
                methodOcrBox.addEventListener("click", this.changeReaderMethod);
                modalContainer.appendChild(methodOcrBox);
                const methodZxingBox = document.createElement("a");
                methodZxingBox.style.position = "absolute";
                methodZxingBox.style.top = "1rem";
                methodZxingBox.style.left = "calc(1.1rem + 65%)";
                methodZxingBox.style.border = "none";
                methodZxingBox.style.borderRadius = "16px";
                methodZxingBox.style.backgroundColor = "#76ad5f";
                methodZxingBox.style.width = "27%";
                methodZxingBox.style.maxWidth = "27%";
                methodZxingBox.style.height = "30px";
                methodZxingBox.textContent = "기본 기능";
                methodZxingBox.style.textAlign = "center";
                methodZxingBox.style.color = "white";
                methodZxingBox.style.padding = "5px 10px";
                methodZxingBox.style.fontSize = "18px";
                methodZxingBox.style.zIndex = "1005";
                methodZxingBox.id = "method-zxing-box";
                methodZxingBox.addEventListener("click", this.changeReaderMethod);
				modalContainer.appendChild(methodZxingBox);
				/*
				const guideBox = document.createElement("div");
				guideBox.style.position = "absolute";
				guideBox.style.border = "5px solid red";
				guideBox.style.borderRadius = "2px";
				guideBox.style.backgroundColor = "transparent";
				guideBox.style.width = "90%";
				guideBox.style.maxWidth = "600px";
				guideBox.style.height = "100px";
				guideBox.style.zIndex = "1006";
				guideBox.id = "method-guide-box";
				guideBox.style.top = "50%";
				guideBox.style.left = "50%";
				guideBox.style.transform = "translate(-50%, -50%)";
				modalContainer.appendChild(guideBox);
				*/
				const actionButton = document.createElement("button");
				actionButton.textContent = "인식시작";
				actionButton.id = "ocrReaderActionButton";
				actionButton.style.margin = "10px";
				actionButton.style.padding = "10px 20px";
				actionButton.style.fontSize = "16px";
				actionButton.style.cursor = "pointer";
				actionButton.style.border = "none";
				actionButton.style.borderRadius = "5px";
				actionButton.style.backgroundColor = "#7db958";
				actionButton.style.color = "white";
				actionButton.style.display = "inline-block";
				actionButton.style.position = "absolute";
				actionButton.style.bottom = "12%";
				//actionButton.style.right = "50%";
				actionButton.style.zIndex = "1002";
				actionButton.style.display = "none";
				actionButton.addEventListener("click", this.ocrReaderRun);
				modalContainer.appendChild(actionButton);
                
            }
            
            // 팝업 추가
            this.modalBackground.appendChild(modalContainer);
            document.body.appendChild(this.modalBackground);
            // 팝업 표시
            this.modalBackground.style.display = "flex";
			this.startScanning();
        },
        /**
         * 카메라의 줌 기능을 사용할 수 있는 지 확인
         */
        isPossibleZoom: function() {
            const capabilities = this.video.srcObject.getVideoTracks()[0].getCapabilities();
            var isPossible = navigator.mediaDevices.getSupportedConstraints().zoom && capabilities["zoom"];
			/* IOS인 경우 Zoom기능 미지원
			var isPossible = navigator.mediaDevices.getSupportedConstraints().zoom 
							&& capabilities["zoom"] 
							&& !(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && "ontouchend" in document));
							*/
            if(isPossible) {
                this.zoomStatus = "able";
                this.zoomMinValue = Number(capabilities["zoom"]["min"]);
                this.zoomMaxValue = Number(capabilities["zoom"]["max"]);
            }
            else {
                this.zoomStatus = "unable";
            }
            return isPossible;
        },
        /**
         * 카메라의 zoom 최대치 리턴
         */
        getMaxZoom: function() {
            const capabilities = this.video.srcObject.getVideoTracks()[0].getCapabilities();
            return capabilities["zoom"]["max"];
        },
        /**
         * 카메라의 zoom 최적치 리턴
         */
        getAverageZoom: function() {
            const capabilities = this.video.srcObject.getVideoTracks()[0].getCapabilities();
            if(navigator.userAgent.toLowerCase().includes("iphone") || navigator.userAgent.toLowerCase().includes("ipad") || (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && "ontouchend" in document))) {
                if(this.barcodeType == "1d") {
                	return 4;
				}
                else {
                    return 4;
                }
            }
            else if(navigator.userAgent.toLowerCase().includes("android")) {
                //android인 경우 4 반환
				return 4;
				//return Number(capabilities["zoom"]["max"]) / 2;
            }
        },
        /**
         * 카메라 track 동작 설정 값
         */
        getTrackConstraints: function(zoomValue) {
            const constraints = {
                video: true,
                audio: false,
                deviceId: this.backCameraDeviceId,
                advanced: [{zoom: zoomValue}],
            };
            return constraints;
        },
        /**
         * 카메라 동작 설정 값
         */
        getVideoConstraints: function(selectedDeviceId) {
            const constraints = (this.isMobileDevice() && selectedDeviceId) ? 
                {
                    width: 1920,
                    height: 1080,
                    deviceId: selectedDeviceId,
                    zoom: true,
                    audio: false,
                }
                : 
                true
                ;
            return constraints;
        },
        zoomIn: async function() {
            if(this.zoomStatus == "able" && this.zoomCurrentValue < this.zoomMaxValue) {
                const zoomValue = this.zoomCurrentValue + 1;
                this.setZoomValue(zoomValue);
            }
        },
        zoomOut: async function() {
            if(this.zoomStatus == "able" && this.zoomCurrentValue > this.zoomMinValue) {
                const zoomValue = this.zoomCurrentValue - 1;
                this.setZoomValue(zoomValue);
            }
        },
        setZoomValue: async function(zoomValue) {
            this.zoomCurrentValue = zoomValue
            const trackConstraints = this.getTrackConstraints(this.zoomCurrentValue);
            const track = this.currentStream.getVideoTracks()[0];
            await track.applyConstraints(trackConstraints);
            const zoomBarBackground = document.getElementById("zoomBarBackground");
            zoomBarBackground.textContent = "배율 : " + this.zoomCurrentValue;
            const zoomBarForeground = document.getElementById("zoomBarForeground");
            let ratio = (this.zoomCurrentValue / this.zoomMaxValue);
            zoomBarForeground.style.width = "calc((100% - 230px) * " + ratio + ")";
            zoomBarForeground.style.maxWidth = "calc((100% - 230px) * " + ratio + ")";
            const expiredDate = new Date();
            expiredDate.setTime(expiredDate.getTime() + 365 * 24 * 60 * 60 * 1000);
            document.cookie = "barcode-reader-" + this.barcodeType + "-zoom-current-value=" + this.zoomCurrentValue + "; path=/; expires=" + expiredDate.toUTCString() + "; secure=true;"
        },
        /**
         * 바코드 리더 확대/축소 값 쿠기 저장 및 사용
         */
        getBarCodeReaderZoomCurrentValueOnCookie: function() {
            const dataArray = document.cookie.split(";");
            let value = -1;
            for(let i = 0; i < dataArray.length; i++) {
                const keyValueArray = dataArray[i].split("=");
                if(keyValueArray.length > 1 && keyValueArray[0].trim() === "barcode-reader-" + this.barcodeType + "-zoom-current-value") {
                    value = Number(keyValueArray[1]);
                }
            }
            return value;
        },
        /**
         * QR 스캐너를 실행하는 함수 (스마트폰에서는 후면 카메라 강제 사용)
         * @param {string} inputFieldId - QR 코드 결과를 입력할 input 필드의 ID
         */
        openBarcodeScanner: async function(barcodeType = "1d") {
            this.setReadValueThenClose("");
            this.barcodeType = barcodeType;
            if(this.barcodeType == "1d") {
                this.readerMethod = "zxing";
            }
            if (!this.codeReader) {
                alert("QR 스캐너 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도하세요.");
                return;
            }
            this.isDone = false;
            // 기존 카메라 스트림이 있으면 종료
            this.stopCamera();
            // 카메라 사용 허용
            //await this.requestCameraPermission();
            // 화면 그리기(모달 팝업 생성)
            this.createModalView();
		},
		startScanning: async function(){
			this.backCameraDeviceId = await this.getBackCameraId();
			const videoConstraints = this.getVideoConstraints(this.backCameraDeviceId);
            const barcodeScanStartDate = new Date();
			function secondsBetweenTimestamp(ts1, ts2) {
			    return Math.abs(ts1 - ts2) / 1000;
			}
            // 카메라 실행
			//시간측정 History용
			this.actionHistory = {
			    uuid: "",
				type: this.barcodeType == "1d"?"B":"Q",
			    userId: "",
				deviceModel: "",
			    startTimeStamp: 0,
			    tryHistory: [],
			};
			this.actionHistory.uuid = crypto.randomUUID();
			if(this.$parent.session && this.$parent.session.USER_ID) {
			    this.actionHistory.userId = this.$parent.session.USER_ID;
			}
			/*
			if (navigator.userAgentData) {
				navigator.userAgentData.getHighEntropyValues(["model"]).then(ua => {this.actionHistory.deviceModel = ua.model});
			}
			*/
			this.detectDeviceInfo().then(info => { this.actionHistory.deviceModel = info.deviceType +" : "+ info.deviceModel });
			
            navigator.mediaDevices
                .getUserMedia({ video: videoConstraints })
                .then((stream) => {
                    this.currentStream = stream; // 현재 스트림 저장
                    this.video.srcObject = stream;
                    // 비디오가 완전히 로드된 후 실행
                    this.video.onloadedmetadata = async () => {
                        this.video.play();
						this.actionHistory.startTimeStamp = Date.now();
                        let zoomValue = 0;
                        if(this.isPossibleZoom()) {
                            if(this.getBarCodeReaderZoomCurrentValueOnCookie() > -1) {
                                zoomValue = this.getBarCodeReaderZoomCurrentValueOnCookie();
                            }
                            else {
                                zoomValue = this.getAverageZoom();
                            }
                            this.setZoomValue(zoomValue);
                            document.getElementById("zoomInButton").style.display = "";
                            document.getElementById("zoomOutButton").style.display = "";
                            document.getElementById("zoomBarBackground").style.display = "";
                            document.getElementById("zoomBarForeground").style.display = "";
                        }
                        else {
                            document.getElementById("zoomInButton").style.display = "none;";
                            document.getElementById("zoomOutButton").style.display = "none;";
                            document.getElementById("zoomBarBackground").style.display = "none;";
                            document.getElementById("zoomBarForeground").style.display = "none;";
                        }
                    };
                    
					const tryHistoryItem = {attempt: 0, captureTimeStamp: Date.now(), sendTimeStamp: 0, receiveTimeStamp: 0, warebizKdata: "", warebizTime: "", wasStartTimeStamp: 0, wasEndTimeStamp: 0};
					this.actionHistory.tryHistory.push(tryHistoryItem);
					const data = {};
					data.tryHistoryItem = tryHistoryItem;
					// ZXing으로 바코드 읽기
					var count = 0;
                    this.codeReader.decodeFromVideoDevice(this.backCameraDeviceId, this.video, async (result, err) => {
						count ++;
                        if (result) {
							data.tryHistoryItem.receiveTimeStamp = Date.now();
							data.tryHistoryItem.warebizKdata = result.text;
							data.tryHistoryItem.warebizTime = secondsBetweenTimestamp(data.tryHistoryItem.receiveTimeStamp, this.actionHistory.startTimeStamp);
							data.tryHistoryItem.attempt = count;
                            this.rawValue = result.text;
                            if(this.barcodeType == "1d") { // 바코드 스캔일 경우
                                if(this.readerMethod == "zxing") {
                                    console.log("바코드 스캔 성공:", this.rawValue);
									let value = this.rawValue.replace(/\*/g, ''); //바코드 인식 시 * 제거(20260316)
									this.rawValue = value; 
                                    await this.setReadValueThenClose(this.rawValue); // 결과 입력. 결과값에 따라서 종료됨.
                                }
                            }
                            else { // QR코드 스캔일 경우
                                this.rawValue = result.text;
                                const resultValue = this.parseValue(this.rawValue);
                                console.log("QR 코드 스캔 성공:", this.rawValue);
                                await this.setReadValueThenClose(resultValue); // 결과 입력. 결과값에 따라서 종료됨.
                            }
                        }
						if (this.isZXingPaused) {
						    return;
						}
                        /*
                        if (err) {
                            if(barcodeType == "1d") {
                                console.warn("바코드 스캔 실패");
                                const barcodeScanDate = new Date();
                                const delaySeconds = Math.floor((barcodeScanDate.getTime() - barcodeScanStartDate.getTime()) / 1000);
                                // ZXing 스캔이 5초 이상 식별이 안되는 경우 OCR 인식 시작
                                if(delaySeconds >= 5) {
                                    this.startOCRProcessing(this.video);
                                }
                            }
                            else {
                                console.warn("QR코드 스캔 실패");
                            }
                            console.warn(err);
                        }
                        */
                    });
					/*
                    if(barcodeType == "1d") {
                        // Warebiz OCR로 읽기
                        this.startOCRProcessing(this.video);
                    }
					*/
						
                });
        },
        pictureSelect: function() {
            if(this.pictureInput.files && this.pictureInput.files[0]) {
                const reader = new FileReader();
                const $this = this;
                reader.onload = function(e) {
                    $this.pictureSelectViewImg.src = e.target.result;
                    $this.stopCamera();
                    document.getElementById("barcode-scanner-video").style.display = "none";
                    $this.pictureSelectViewImg.style.display = "";
                    if($this.barcodeType == "2d") { // QR 코드 인식
                        const codeReader = new ZXing.BrowserMultiFormatReader();
                        codeReader.decodeFromImageElement($this.pictureSelectViewImg)
                            .then((result, err) => {
                                if (result) {
                                    $this.rawValue = result.text;
                                    console.log("QR 코드 스캔 성공:", $this.rawValue);
                                    $this.setReadValueThenClose($this.parseValue(result.text)); // 결과 입력. 결과값에 따라서 종료함.
                                }
                                if (err) {
                                    console.warn("QR 코드 인식 오류:");
                                    console.warn(err);
                                }
                            })
                            .catch(error => {
                                if(error.name == "N") {
                                    $this.setReadValueThenClose("");
                                    console.log("인식되지 않는 QR 이미지");
                                    $this.stopCamera(); // 스캔 성공 시 카메라 종료
                                    $this.modalBackground.remove();
                                    $this.$emit("callback"); // 콜백
                                    $this.isDone = true;
                                    alert("선택한 사진을 QR로 인식할 수 없습니다. 사진을 확인하여 보시기 바랍니다.");
                                }
                                else {
                                    console.error("이미지 파일 인식 오류:");
                                    console.error(error);
                                    $this.isDone = true;
                                    alert("선택한 사진을 사용할 수 없습니다. 사진을 확인하여 보시기 바랍니다.");
                                    $this.closeScanner();
                                }
                            });
                    }
                    else { // 1차원 바코드 인식. 1. Zxing 모듈로 읽기. 2. Warebiz OCR로 읽기
                        let resultText = "";
                        const codeReader = new ZXing.BrowserMultiFormatReader();
                        codeReader.decodeFromImageElement($this.pictureSelectViewImg)
                            .then((result, err) => {
                                if (result) {
                                    resultText = result.text;
                                }
                                if(resultText) {
                                    $this.setReadValueThenClose(resultText);
                                }
                                else {
                                    const capturedImage = $this.pictureSelectViewImg.src;
                                    const capturedImageBase64 = capturedImage;
                                    const data = {
                                        image_data: capturedImageBase64,
                                    }
                                    //resultText = await $this.requestWarebizOcr(data);
                                    if(resultText) {
                                        $this.setReadValueThenClose(resultText);
                                    }
                                    else {
                                        $this.setReadValueThenClose("");
                                        console.log("인식되지 않는 바코드 이미지");
                                        $this.modalBackground.remove();
                                        $this.$emit("callback"); // 콜백
                                        $this.isDone = true;
                                        alert("선택한 사진을 바코드로 인식할 수 없습니다. 사진을 확인하여 보시기 바랍니다.");
                                    }
                                }
                            });
                    }
                };
                reader.readAsDataURL(this.pictureInput.files[0]);
            }
        },
        startOCRProcessing: function(video) {
            this.isDone = false;
            const canvas = document.createElement("canvas");
            canvas.id = "capture-canvas";
            const context = canvas.getContext("2d");
            const $this = this;

            // 캡처 및 OCR 실행
            async function processFrame() {
                if($this.isDone) return;
                if($this.readerMethod == "zxing" || $this.readerMethod == "ocrReady") {
                    requestAnimationFrame(processFrame);
                    return;
                }
                if($this.isOcrProcessing) {
                    requestAnimationFrame(processFrame);
                    return;
                }
                $this.isOcrProcessing = true;
                // 현재 프레임을 캡처하여 캔버스에 그리기
				canvas.width = video.videoWidth;
				canvas.height = video.videoHeight;
				canvas.style.width = video.videoWidth + "px";
				canvas.style.height = video.videoHeight + "px";
				context.drawImage(video, 0, 0, canvas.width, canvas.height);
				const capturedImage = canvas.toDataURL("image/png");
				const capturedImageBase64 = capturedImage; // data:image/png;base64, 제거하지 않음
				const data = {
				    image_data: capturedImageBase64,
				}
				$this.actionHistory.type = "C";
				$this.actionHistory.tryHistory = [];
				const tryHistoryItem = {captureTimeStamp: Date.now(), sendTimeStamp: 0, receiveTimeStamp: 0, warebizKdata: "", warebizTime: "", wasStartTimeStamp: 0, wasEndTimeStamp: 0};
				$this.actionHistory.tryHistory.push(tryHistoryItem);
				data.tryHistoryItem = tryHistoryItem;
                const readText = await $this.requestWarebizOcr(data);
                console.log("OCR 결과:", readText);
                $this.isOcrProcessing = false;
                if(readText && $this.readerMethod == "ocr") {
                    $this.isDone = true; // OCR 중지
                    setTimeout(async () => {
                        await $this.setReadValueThenClose(readText);
                    }, 10); // 1초 후 닫기
                }
                else {
                    setTimeout(() => requestAnimationFrame(processFrame), 50);
                }
            }

            requestAnimationFrame(processFrame);
        },
        requestWarebizOcr: async function(jsonObject) {
            const headers = {
                "Content-Type": "application/json",
            }
            let resultText = "";
			jsonObject.tryHistoryItem.sendTimeStamp = Date.now();
            await axios
                .post("/ami/mob/emr/api-proxy-warebiz-barcode", jsonObject, {headers})
                .then(response => {
                    if(response.data) {
                        if(typeof response.data == "string") {
                            const jsonResponse = JSON.parse(response.data);
                            if(jsonResponse && jsonResponse.kdata) {
                                resultText = jsonResponse.kdata;
                                resultText = resultText.replaceAll("에러발생", "");
                                resultText = resultText.replaceAll("error", "");
                                resultText = resultText.replaceAll("Error", "");
								// OCR 스캔 시간 측정용 - {
								jsonObject.tryHistoryItem.receiveTimeStamp = Date.now();
								jsonObject.tryHistoryItem.warebizKdata = jsonResponse.kdata;
								jsonObject.tryHistoryItem.warebizTime = jsonResponse.time;
								jsonObject.tryHistoryItem.wasStartTimeStamp = jsonResponse.wasStartTimeStamp;
								jsonObject.tryHistoryItem.wasEndTimeStamp = jsonResponse.wasEndTimeStamp;
								// OCR 스캔 시간 측정용 - }
                            }
                        }
                        else if(response.data.kdata) {
                            resultText = response.data.kdata;
                            console.log(resultText);
							// OCR 스캔 시간 측정용 - {
							jsonObject.tryHistoryItem.receiveTimeStamp = Date.now();
							jsonObject.tryHistoryItem.warebizKdata = response.data.kdata;
							jsonObject.tryHistoryItem.warebizTime = response.data.time;
							jsonObject.tryHistoryItem.wasStartTimeStamp = response.data.wasStartTimeStamp;
							jsonObject.tryHistoryItem.wasEndTimeStamp = response.data.wasEndTimeStamp;
							// OCR 스캔 시간 측정용 - }
                        }
                    }
                })
                .catch(error => {
                    console.log("OCR Request Error");
                    console.log(error);
                });
            return resultText;
        },
        closeScanner: function() {
            this.stopCamera();
            this.isDone = true;
            this.modalBackground.remove(); // 팝업 제거
        },
        changeReaderMethod: function(event) {
            event.stopPropagation();
            const activeBox = event.target;
            const deactiveBox = activeBox.id == "method-ocr-box" ? document.getElementById("method-zxing-box") : document.getElementById("method-ocr-box");
            deactiveBox.style.backgroundColor = "#595959";
            this.readerMethod = activeBox.id =="method-ocr-box" ?"ocrReady":"zxing";
            activeBox.style.backgroundColor = "#76ad5f";
			const actionBox = document.getElementById("ocrReaderActionButton");
			actionBox.style.display = activeBox.id =="method-ocr-box" ? "":"none";
			actionBox.style.backgroundColor = "#76ad5f";
			actionBox.innerHTML = "인식시작";
			if(this.readerMethod == "ocrReady") {
			    //this.codeReader.reset(); 
				this.isZXingPaused = true;
				return;
			}
			if (this.readerMethod == "zxing") {
				this.isZXingPaused = false;
			    this.resumeZXing();
			}
        },
		resumeZXing() {
		    if (!this.currentStream) return;
		    this.codeReader.decodeFromVideoDevice(
		        this.backCameraDeviceId,
		        this.video,
		        async (result, err) => {
		            if(this.readerMethod !== "zxing") return;
		            if(result) await this.setReadValueThenClose(result.text);
		        }
		    );
		},
		ocrReaderRun: function(){
			const actionBox = document.getElementById("ocrReaderActionButton");
			actionBox.style.backgroundColor = "#595959";
			actionBox.innerHTML = "인식중...";
			this.startOCRProcessing(this.video);
			this.readerMethod = "ocr";
		},
		detectDeviceInfo: async function() {
			const ua = navigator.userAgent || "";
			const platform = navigator.platform || "";
			const isIOS =
				/iPad|iPhone|iPod/.test(ua) ||
				(platform === "MacIntel" && navigator.maxTouchPoints > 1);
			const isAndroid = /Android/i.test(ua);

			// 1️. Chromium 기반 환경이면 getHighEntropyValues 우선 시도
			if (navigator.userAgentData) {
				try {
					const uaData = await navigator.userAgentData.getHighEntropyValues([
						"model",
						"platform",
						"platformVersion",
					]);
					return {
						deviceType: isAndroid ? "Android" : "iPhone/iPad",
						deviceModel: uaData.model || "Unknown",
						platform: uaData.platform || (isAndroid ? "Android" : "iOS"),
						platformVersion: uaData.platformVersion || "Unknown",
						cameraCount: 0,
						cameraLabels: [],
						source: "High Entropy Values",
					};
				} catch (err) {
					console.warn("getHighEntropyValues 실패, fallback 사용");
				}
			}

			// 2️. 기본 환경 정보
			let deviceType = "Unknown";
			if (/iPhone/.test(ua)) deviceType = "iPhone";
			else if (/iPad/.test(ua)) deviceType = "iPad";
			else if (isAndroid) deviceType = "Android";
			else if (/Macintosh/.test(ua) && isIOS) deviceType = "iPad"; // 데스크톱 모드
			else if (/Macintosh/.test(ua)) deviceType = "Mac";

			// 3️. OS 버전 추출
			let osVersion = "Unknown";
			if (isIOS) {
				const m = ua.match(/OS (\d+_\d+(_\d+)?)/);
				osVersion = m ? m[1].replace(/_/g, ".") : "Unknown";
			} else if (isAndroid) {
				const m = ua.match(/Android\s([0-9\.]+)/);
				osVersion = m ? m[1] : "Unknown";
			}

			// 4️. 화면 정보
			const width = screen.width * window.devicePixelRatio;
			const height = screen.height * window.devicePixelRatio;
			const [w, h] = [Math.max(width, height), Math.min(width, height)];
			const key = `${Math.round(h)}x${Math.round(w)}`;

			// iPhone 전체 세대 매핑 (6 → 17)
			const iPhoneMap = {
				"750x1334": "iPhone 6 / 6s / 7 / 8 / SE(2nd)",
				"1080x1920": "iPhone 6 Plus / 6s Plus / 7 Plus / 8 Plus",
				"1125x2436": "iPhone X / XS / 11 Pro",
				"828x1792": "iPhone XR / 11",
				"1242x2688": "iPhone XS Max / 11 Pro Max",
				"1080x2340": "iPhone 12 mini / 13 mini",
				"1170x2532": "iPhone 12 / 12 Pro / 13 / 13 Pro / 14",
				"1284x2778": "iPhone 12 Pro Max / 13 Pro Max / 14 Plus",
				"1179x2556": "iPhone 14 Pro / 15 / 15 Pro",
				"1290x2796": "iPhone 14 Pro Max / 15 Plus / 15 Pro Max",
				"1206x2622": "iPhone 16 / 16 Pro",
				"1320x2868": "iPhone 16 Plus / 16 Pro Max",
				"1242x2700": "iPhone 17 / 17 Pro",
				"1366x2940": "iPhone 17 Plus / 17 Pro Max",
			};

			// iPad 기본 매핑
			const iPadMap = {
				"1620x2160": "iPad (9th gen)",
				"1640x2360": "iPad Air (4th/5th gen)",
				"2048x2732": "iPad Pro 12.9″",
				"1668x2388": "iPad Pro 11″",
			};

			// Android 모델명 추출
			let androidModel = "Unknown Android";
			if (isAndroid) {
				const m = ua.match(/Android.*;\s?([\w\s\-]+)\sBuild/i);
				if (m && m[1]) androidModel = m[1].trim();
			}

			let deviceModel = "Unknown";
			if (deviceType === "iPhone") deviceModel = iPhoneMap[key] || "iPhone (generic)";
			else if (deviceType === "iPad") deviceModel = iPadMap[key] || "iPad (generic)";
			else if (deviceType === "Android") deviceModel = androidModel;

			// 5️. GPU 기반 세대 감지 (iPhone)
			const gl = document.createElement("canvas").getContext("webgl");
			const renderer = gl?.getParameter(gl.RENDERER) || "";
			let gpuHint = "";
			if (/A16/i.test(renderer)) gpuHint = " (iPhone 14 Pro / 15급)";
			else if (/A17/i.test(renderer)) gpuHint = " (iPhone 15 Pro / 16급)";
			else if (/A18/i.test(renderer)) gpuHint = " (iPhone 17급 이상)";
			else if (/A15/i.test(renderer)) gpuHint = " (iPhone 13 / 14급)";
			else if (/A14/i.test(renderer)) gpuHint = " (iPhone 12급)";

			// 6️. 카메라 정보 감지
			let cameraCount = 0;
			let cameraLabels = [];
			try {
				const devices = await navigator.mediaDevices.enumerateDevices();
				const cameras = devices.filter((d) => d.kind === "videoinput");
				cameraCount = cameras.length;
				cameraLabels = cameras.map((c) => c.label || "Unnamed Camera");
			} catch (err) {
				console.warn("카메라 접근 실패:", err);
			}

			// 7️. 카메라 기반 Pro 모델 추정
			let camHint = "";
			if (deviceType === "iPhone") {
				if (cameraCount >= 6) camHint = " (Pro / Pro Max 계열 가능성 높음)";
				else if (cameraCount >= 4) camHint = " (기본형 또는 Plus)";
				else camHint = " (구형 iPhone 가능성)";
			} else if (deviceType === "Android") {
				if (cameraCount >= 4) camHint = " (플래그십급)";
				else if (cameraCount === 2) camHint = " (중급기)";
			}

			return {
				deviceType,
				deviceModel: deviceModel + gpuHint + camHint,
				osVersion,
				platform: isIOS ? "iOS" : isAndroid ? "Android" : platform,
				gpuRenderer: renderer || "Unknown",
				cameraCount,
				cameraLabels,
				resolution: `${Math.round(width)}×${Math.round(height)} @${window.devicePixelRatio}x`,
				source: "User-Agent + GPU + Camera + Resolution",
			};
		},		
        parseValue: function(text) {
            function lpad(text, padString, length) {
                let temp = "";
                for(let i = 0; i < length; i++) {
                    temp += "" + padString;
                }
                temp += text;
                return temp.substring(temp.length - 6, temp.length);
            }
            let parsedText = "";
			let parsedText2 = "";
			text = text.split("\x00").join("");
            if(text.split(" ").join("").length == 13) {
                var exp = /^\*\d{11}\*$/;
                var clearedText = text.split(" ").join("");
                if(exp.test(clearedText)) {
                    parsedText = clearedText.split("*").join("");
                }
            }
            else if(text.split(" ").join("").length == 11) {
                var exp = /\d{11}/;
                var clearedText = text.split(" ").join("");
                if(exp.test(clearedText)) {
                    parsedText = clearedText;
                }
            }else if(text.split(" ").join("").length == 15){
				var exp = /^\*[\d-]{11,}\*$/;
				var clearedText = text.split(" ").join("");
				if(exp.test(clearedText)) {
				    parsedText = clearedText.replace(/[*-]/g, "");
				}
			}
            else if(text.indexOf("자재번호") > -1 && text.indexOf("제조년월") > -1 && text.indexOf("제조사") > -1 && text.indexOf("자재 ID") > -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
                        if(textArray[i].indexOf("자재 ID") > -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = keyValueArray[1].trim();
                            break;
                        }
                    }
                }
            }
			else if(text.indexOf("제조자") > -1 
			        && text.indexOf("상담전화번호") > -1 
			        && text.indexOf("자재번호") > -1 
			        && text.indexOf("제조년월") > -1 
			        && (text.indexOf("계기ID") > -1 || text.indexOf("계기 ID") > -1)) {
			    let textArray = [];
			    if(text.split('\r').length > 1) {
			        textArray = text.split('\r');
			    }
			    else if(text.split('\n').length > 1) {
			        textArray = text.split('\n');
			    }
			    if(textArray.length > 1) {
			        for(let i = 0; i < textArray.length; i++) {
						if(textArray[i].indexOf("제조년월") > -1) {
						    let keyValueArray = textArray[i].split(":");
						    parsedText2 = "20"+keyValueArray[1].trim().replace(/\D/g, "");
						}
			            if(textArray[i].indexOf("계기ID") > -1 || textArray[i].indexOf("계기 ID") > -1) {
			                let keyValueArray = textArray[i].split(":");
			                parsedText = keyValueArray[1].trim();
			            }
			        }
			    }
			}
            else if(text.indexOf("제조사") > -1 
                    && text.indexOf("상담전화번호") > -1 
                    && text.indexOf("자재번호") > -1 
                    && text.indexOf("제조년월") > -1 
                    && (text.indexOf("계기ID") > -1 || text.indexOf("계기 ID") > -1)) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
						if(textArray[i].indexOf("제조년월") > -1) {
						    let keyValueArray = textArray[i].split(":");
						    parsedText2 = "20"+keyValueArray[1].trim().replace(/\D/g, "");
						}						
                        if(textArray[i].indexOf("계기ID") > -1 || textArray[i].indexOf("계기 ID") > -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = keyValueArray[1].trim();
                        }
                    }
                }
            }
            else if(text.indexOf("자재번호") > -1 && text.indexOf("제조년월") > -1 && text.indexOf("자재ID") > -1 && text.indexOf("전화번호") > -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
                        if(textArray[i].indexOf("전화번호") > -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = keyValueArray[1].trim();
                            break;
                        }
                    }
                }
            }
            else if(text.indexOf("기기명") > -1 && text.indexOf("제조년월") > -1 && text.indexOf("제조사") > -1 && text.indexOf("제조국가") > -1 && text.indexOf("제조번호") > -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
                        if(textArray[i].indexOf("제조번호") > -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = keyValueArray[1].trim();
                            break;
                        }
                    }
                }
            }
            else if(text.indexOf("PID") > -1 && text.indexOf("YYMM") > -1 && text.indexOf("MID") > -1) {
                let textArray = [];
                textArray = text.split(/\r?\n/);
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
						if(textArray[i].indexOf("YYMM") > -1) {
						    let keyValueArray = textArray[i].split(":");
						    parsedText2 = "20"+keyValueArray[1].trim().replace(/\D/g, "");
						}						
                        if(textArray[i].indexOf("MID") > -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = keyValueArray[1].trim();
                        }
                    }
                }else if(textArray.length == 1){ //한 줄에 PID, YYMM, MID 존재
					for (let i = 0; i < textArray.length; i++) {
						const line = textArray[i];
						const yymmMatch = line.match(/YYMM\s*:\s*([\d.]+)/);
						const midMatch = line.match(/MID\s*:\s*([0-9A-Z]+)/);
						if (yymmMatch) {
							parsedText2 = "20" + yymmMatch[1].replace(/\D/g, "");
						}
						if (midMatch) {
							parsedText = midMatch[1];
						}
					}
				}
            }
            else if(text.indexOf("PID") > -1 && text.indexOf("MID") > -1 && text.indexOf("YYMM") == -1) {
                parsedText = text.substring(text.indexOf("MID") + 4, text.length);
                if(parsedText) {
                    parsedText = parsedText.trim();
                }
            }
			else if(text.indexOf("BID.NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("BID") > -1 && text.indexOf("Q'TY") > -1 && text.indexOf("PLID") == -1) {
				let textArray = [];
				textArray = text.split(/\r?\n/);
				if(textArray.length == 1) { //한 줄에 BID.NO, PID, BID, Q'TY 존재
				    for(let i = 0; i < textArray.length; i++) {
						const line = textArray[i];
						const bidMatch = line.match(/BID\s*:\s*([A-Z]?\d+)/);
						//const bidMatch = line.match(/BID\s*:\s*(\d+)/);
						if (bidMatch) {
							const value = bidMatch[1].trim();
							const result = value.indexOf("B") > -1 ? value : lpad(value, "0", 6);
							parsedText = result;
				        }
				        
				        const pidMatch = line.match(/PID\s*:\s*([A-Z]?\d+)/);
				        if(pidMatch){
							const value = bidMatch[1].trim();
							const result = value.indexOf("P") > -1 ? value : lpad(value, "0", 6);
							parsedText2 = result;
						}
				    }
				}else if(textArray.length > 1) {
				    for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("BID") > -1 && textArray[i].indexOf("BID.NO") == -1) {
				            let keyValueArray = textArray[i].split(":");
				            if(keyValueArray[1].indexOf("B") > -1 ){
				                parsedText = keyValueArray[1].trim(); //new QR
				            }else{
				                parsedText = lpad(keyValueArray[1].trim(), "0", 6); //old QR
				            }
				            break;
				        }
				    }
				    
				    for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("PID") > -1) {
				            let keyValueArray = textArray[i].split(":");
				            if(keyValueArray[1].indexOf("P") > -1 ){
				                parsedText2 = keyValueArray[1].trim(); //new QR
				            }else{
				                parsedText2 = lpad(keyValueArray[1].trim(), "0", 6); //old QR
				            }
				            break;
				        }
				    }
				}
			}
            else if(text.indexOf("BID.NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("BID") > -1 && text.indexOf("Q'TY") > -1 && text.indexOf("PLID") == -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
						if(textArray[i].indexOf("BID.NO") > -1) {
						    let keyValueArray = textArray[i].split(":");
						    parsedText2 = keyValueArray[1].trim();
						}
                        if(textArray[i].indexOf("BID") > -1 && textArray[i].indexOf("BID.NO") == -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = lpad(keyValueArray[1].trim(), "0", 6);
                        }
                    }
                }
            }
            else if(text.indexOf("BID.NO") > -1 && text.indexOf("CON.NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("BID") > -1 && text.indexOf("QTY") > -1 && text.indexOf("PLID") == -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
						if(textArray[i].indexOf("BID.NO") > -1) {
						    let keyValueArray = textArray[i].split(":");
						    parsedText2 = keyValueArray[1].trim();
						}
                        if(textArray[i].indexOf("BID") > -1 && textArray[i].indexOf("BID.NO") == -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = lpad(keyValueArray[1].trim(), "0", 6);
                        }
                    }
                }
            }
            else if(text.indexOf("BID NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("PLID") > -1 && text.indexOf("Q'TY") > -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
                        if(textArray[i].indexOf("PLID") > -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = lpad(keyValueArray[1].trim(), "0", 6);
                            break;
                        }
                    }
                    
                    for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("PID") > -1) {
				            let keyValueArray = textArray[i].split(":");
				            if(keyValueArray[1].indexOf("P") > -1 ){
				                parsedText2 = keyValueArray[1].trim(); //new QR
				            }else{
				                parsedText2 = lpad(keyValueArray[1].trim(), "0", 6); //old QR
				            }
				            break;
				        }
				    }
				    
                }
            }
			else if(text.indexOf("BID NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("PLID") > -1 && text.indexOf("Q'YT") > -1) {
			    let textArray = [];
			    textArray = text.split(/\r?\n/);
			    if(textArray.length > 0) { //한 줄에 BID NO,  PID, PLID, Q'YT 존재
			        for(let i = 0; i < textArray.length; i++) {
			            if(textArray[i].indexOf("PLID") > -1) {
							const line = textArray[i];
							const plidMatch = line.match(/PLID\s*:\s*(\d+)/);
							if (plidMatch) {
								parsedText = lpad(plidMatch[1].trim(), "0", 6);
							}
							break;
			            }
			        }
			    }
			}
			else if(text.indexOf("BID.NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("PLID") > -1 && text.indexOf("QTY") > -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
                        if(textArray[i].indexOf("PLID") > -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = lpad(keyValueArray[1].trim(), "0", 6);
                            break;
                        }
                    }
                    
                    for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("PID") > -1) {
				            let keyValueArray = textArray[i].split(":");
				            if(keyValueArray[1].indexOf("P") > -1 ){
				                parsedText2 = keyValueArray[1].trim(); //new QR
				            }else{
				                parsedText2 = lpad(keyValueArray[1].trim(), "0", 6); //old QR
				            }
				            break;
				        }
				    }
				    
                }
            }
            else if(text.indexOf("BID.NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("PLID") > -1 && text.indexOf("Q'TY") > -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
                        if(textArray[i].indexOf("PLID") > -1) {
                            let keyValueArray = textArray[i].split(":");
							if(keyValueArray[1].indexOf("P") > -1 ){
								parsedText = keyValueArray[1].trim();
							}else{
								parsedText = lpad(keyValueArray[1].trim(), "0", 6);	
							}
                            break;
                        }
                    }
                    
                    for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("PID") > -1) {
				            let keyValueArray = textArray[i].split(":");
				            if(keyValueArray[1].indexOf("P") > -1 ){
				                parsedText2 = keyValueArray[1].trim(); //new QR
				            }else{
				                parsedText2 = lpad(keyValueArray[1].trim(), "0", 6); //old QR
				            }
				            break;
				        }
				    }
				    
                }
            }
            else if(text.indexOf("BIN NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("PLID") > -1 && text.indexOf("Q'TY") > -1) {
                let textArray = [];
                if(text.split('\r').length > 1) {
                    textArray = text.split('\r');
                }
                else if(text.split('\n').length > 1) {
                    textArray = text.split('\n');
                }
                if(textArray.length > 1) {
                    for(let i = 0; i < textArray.length; i++) {
                        if(textArray[i].indexOf("PLID") > -1) {
                            let keyValueArray = textArray[i].split(":");
                            parsedText = lpad(keyValueArray[1].trim(), "0", 6);
                            break;
                        }
                    }
                    
                    for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("PID") > -1) {
				            let keyValueArray = textArray[i].split(":");
				            if(keyValueArray[1].indexOf("P") > -1 ){
				                parsedText2 = keyValueArray[1].trim(); //new QR
				            }else{
				                parsedText2 = lpad(keyValueArray[1].trim(), "0", 6); //old QR
				            }
				            break;
				        }
				    }
                }
            }
			else if(text.indexOf("BID NO") > -1 && text.indexOf("PID") > -1 && text.indexOf("PLID") > -1 && text.indexOf("Q' TY") > -1) {
			    let textArray = [];
			    if(text.split('\r').length > 1) {
			        textArray = text.split('\r');
			    }
			    else if(text.split('\n').length > 1) {
			        textArray = text.split('\n');
			    }
			    if(textArray.length > 1) {
			        for(let i = 0; i < textArray.length; i++) {
			            if(textArray[i].indexOf("PLID") > -1) {
			                let keyValueArray = textArray[i].split(":");
			                parsedText = lpad(keyValueArray[1].trim(), "0", 6);
			                break;
			            }
			        }
			        
			        for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("PID") > -1) {
				            let keyValueArray = textArray[i].split(":");
				            if(keyValueArray[1].indexOf("P") > -1 ){
				                parsedText2 = keyValueArray[1].trim(); //new QR
				            }else{
				                parsedText2 = lpad(keyValueArray[1].trim(), "0", 6); //old QR
				            }
				            break;
				        }
				    }
			    }
			}
			else if(text.indexOf("SKT") > -1) {
				const match = text.match(/\d{11}/);
				const textVal = match ? match[0] : text;
				parsedText = textVal;
			}
			else if(text.indexOf("계약번호") > -1 && text.indexOf("자재번호") > -1 && text.indexOf("박스번호") > -1 && text.indexOf("수량") > -1) {
				let textArray = [];
				textArray = text.split(/\r?\n/);
				if(textArray.length > 1) {
				    for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("박스번호") > -1) {
				            let keyValueArray = textArray[i].split(":");
				            parsedText = lpad(keyValueArray[1].trim(), "0", 6);
				            break;
				        }
				    }
				}
			}
			else if(text.indexOf("자재번호") > -1 && text.indexOf("제조년월") > -1 && text.indexOf("자재 ID") > -1) {
				let textArray = [];
				textArray = text.split(/\r?\n/);
				if(textArray.length > 1) {
				    for(let i = 0; i < textArray.length; i++) {
				        if(textArray[i].indexOf("자재 ID") > -1) {
				            let keyValueArray = textArray[i].split(":");
				            parsedText = keyValueArray[1].trim();
				            break;
				        }
				    }
				}
			}
			//20260305 신규패턴 추가 {"pcknNo":"0PCW99JP4QKY3"}
			else if(text.indexOf("pcknNo") > -1) {
				const match = text.match(/"pcknNo"\s*:\s*"([^"]+)"/);
				const textVal = match ? match[0] : text;
				parsedText = textVal;
			}
            else {
                parsedText = text;
            }
            if(parsedText.indexOf("*") > -1) {
                parsedText.replaceAll("*", "");
            }
            return { value: parsedText, value2: parsedText2 };
        },
    }
});

/*
[QR 예제 1]
자재번호 : 128143, SMGW-C(LTE)
제조년월 : 2024년 12월
제조사 : (주)누리플렉스
자재 ID : 47S348594393

[QR 예제 2]
제조사 : (주)한산에이엠에스텍크
상담전화번호 : 031-447-0588
자재번호 : 127825
제조년월 : 24년09월
계기ID : 25530037724

[QR 예제 3]
제조사 : (주)남전사
상담전화번호 : 055-326-9001
자재번호 : 127825
제조년월 : 23년 12월
계기ID : 08530037324

[QR 예제 4]
제조사 : 서창전기통신(주)
상담전화번호 : 053-585-6271
자재번호 : 127825
제조년월 : 23년08월
계기ID : 05530000646

[QR 예제 5]
PID : 127825
YYMM : 24.12
MID : LA530067076

[QR 예제 6]
제조자 : ㈜씨앤유글로벌
상담전화번호 : 031-698-2354
자재번호 : 127823
제조년월 : 21년11월
계기ID : A0520000416

[QR 예제 7]
자재번호 : 128143
제조년월 : 25.10
자재 ID : G1S322991901

[BOX QR 예제1]
BID.NO : G012046386
PID : 127827
BID : 17916
Q'TY : 4

[팔레트 QR 예제1]
BID NO : 2025406386
PID : 127827
PLID : 1
Q'TY : 48

[팔레트 QR 예제2]
BID.NO : 2025406386
PID : 127827
PLID : 1
Q'TY : 48

[팔레트 QR 예제3]
BIN NO : G117250040
PID : 127825
PLID : 1
Q'TY : 21

[팔레트 QR 예제4]
BIN NO : G117250040
PID : 127825
PLID : 1
Q' TY : 21

[팔레트 QR 예제5]
BID.NO : 2025406386
PID : 127827
PLID : 1
QTY : 48
*/
