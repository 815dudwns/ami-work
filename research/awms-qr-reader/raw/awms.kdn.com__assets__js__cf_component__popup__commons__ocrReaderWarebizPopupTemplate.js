/********************************************************************************************
 * @Writer 
 *  백세민 2025. 02. 17. 
 *  
 * @Description
 *  OCR Reader
 * 
 * @Syntax
 *  <ocr-reader-warebiz ref="ocrReaderWarebiz" id="mobemr1000_ocr_reader" title="계기" @callback="receiveOcr"></ocr-reader-warebiz>
 *
 * @Parameters
 *
 ********************************************************************************************/

Vue.component('ocr-reader-warebiz', {
    props: ['id', 'title'],
    data: function() {
        return {
            meterNumber: "",
            currentStream: null,
            isProcessing: false,
            modalBackground: null, // 모달 창 참조 저장
            isCaptured: false,
            ocrString: "",
            processedBase64String: "",
            actionHistory: {
                uuid: "",
				type: "O",
                userId: "",
				deviceModel: "",
                startTimeStamp: 0,
                tryHistory: [
                    {captureTimeStamp: 0, sendTimeStamp: 0, receviceTimeStamp: 0, warebizKdata: "", warebizTime: "", wasStartTimeStamp: 0, wasEndTimeStamp: 0}
                ],
            },
            actionButtonTimeStamp: 0,
            actionButtonSecondLimit: 5,
        }
    },
    template: `
    `,
    mounted: function() {
    },
    methods: {
        stopCamera: function() {
            if(this.currentStream) {
                this.currentStream.getTracks().forEach(track => track.stop());
                this.currentStream = null;
            }
            let video = document.getElementById("ocr-video");
            video.srcObject = null;
            video.remove();
        },
        openOCRScanner: async function() {
            if (this.currentStream) {
                this.stopCamera();
            }
            this.isCaptured = false;

            // 모달 UI 생성
            this.modalBackground = document.createElement("div");
            this.modalBackground.style.position = "fixed";
            this.modalBackground.style.top = 0;
            this.modalBackground.style.left = 0;
            this.modalBackground.style.width = "100vw";
            this.modalBackground.style.height = "100vh";
            this.modalBackground.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
            this.modalBackground.style.display = "flex";
            this.modalBackground.style.justifyContent = "center";
            this.modalBackground.style.alignItems = "center";
            this.modalBackground.style.zIndex = 1000;

            const modalContainer = document.createElement("div");
            modalContainer.style.background = "white";
            modalContainer.style.padding = "20px";
            modalContainer.style.borderRadius = "10px";
            modalContainer.style.textAlign = "center";
            modalContainer.style.width = "90%";
            modalContainer.style.maxWidth = "400px";
            modalContainer.style.display = "flex";
            modalContainer.style.flexDirection = "column";
            modalContainer.style.alignItems = "center";
            modalContainer.style.position = "relative";
            modalContainer.style.boxShadow = "0px 4px 10px rgba(0, 0, 0, 0.3)";
            modalContainer.style.zIndex = 1001;

            const video = document.createElement("video");
            video.id = "ocr-video";
            video.autoplay = true;
            video.playsInline = true;
            video.style.width = "100%";
            video.style.maxWidth = "100%";
            video.style.height = "auto";
            //video.style.maxHeight = "300px";
            video.style.borderRadius = "10px";
            //video.style.objectFit = "cover";
            video.style.objectFit = "scale-down";
            
            modalContainer.appendChild(video);

            const overlayCanvas = document.createElement("canvas");
            overlayCanvas.id = "overlay-canvas";
            modalContainer.appendChild(overlayCanvas);

            const output = document.createElement("div");
            output.id = "ocr-output";
            output.innerHTML = "🔍 스캔 중...";
            output.style.marginTop = "10px";
            modalContainer.appendChild(output);
            
            const buttonDiv = document.createElement("div");
            modalContainer.appendChild(buttonDiv);

            const closeButton = document.createElement("button");
            closeButton.textContent = "닫기";
            closeButton.id = "ocrReaderCloseButton";
            closeButton.style.margin = "10px";
            closeButton.style.padding = "10px 20px";
            closeButton.style.fontSize = "16px";
            closeButton.style.cursor = "pointer";
            closeButton.style.border = "none";
            closeButton.style.borderRadius = "5px";
            closeButton.style.backgroundColor = "#333";
            closeButton.style.color = "white";
            closeButton.style.display = "inline-block";
            closeButton.addEventListener("click", this.closeScanner);
            buttonDiv.appendChild(closeButton);

            const actionButton = document.createElement("button");
            actionButton.textContent = "인식시작"; // 인식중..
            actionButton.id = "ocrReaderActionButton";
            actionButton.style.margin = "10px";
            actionButton.style.padding = "10px 20px";
            actionButton.style.fontSize = "16px";
            actionButton.style.cursor = "pointer";
            actionButton.style.border = "none";
            actionButton.style.borderRadius = "5px";
            actionButton.style.backgroundColor = "#7db958"; // #2d5514
            actionButton.style.color = "white";
            actionButton.style.display = "inline-block";
            actionButton.addEventListener("click", this.ocrReaderRun);
            buttonDiv.appendChild(actionButton);

            this.modalBackground.appendChild(modalContainer);
            document.body.appendChild(this.modalBackground);

            this.modalBackground.style.display = "flex";

            // 후면 카메라 선택 (환경 모드 우선)
            const videoConstraints = { facingMode: "environment" };
            let counter = 0;

            navigator.mediaDevices.getUserMedia({ video: videoConstraints })
                .then((stream) => {
                    this.currentStream = stream;
                    video.srcObject = stream;
                    video.onloadedmetadata = () => {
                        video.play();
                        this.drawRedRectangle(video, overlayCanvas);
                        console.log("onloadedmetadata:" + counter);
                        counter++;
                        //this.startOCRProcessing(video, output);
                    };
                })
                .catch((error) => {
                    console.error("카메라 접근 오류:", error);
                    output.textContent = "❌ 카메라 접근 실패!";
                });
        },
        drawRedRectangle: function(video, overlayCanvas) {
            overlayCanvas.width = video.clientWidth;
            overlayCanvas.height = video.clientHeight;
            overlayCanvas.style.position = "absolute";
            overlayCanvas.style.top = video.offsetTop + "px";
            overlayCanvas.style.left = video.offsetLeft + "px";
            overlayCanvas.style.pointerEvents = "none";
            overlayCanvas.style.zIndex = "2";
            const ctx = overlayCanvas.getContext("2d");
            ctx.strokeStyle = "red";
            ctx.lineWidth = 4;
            const rectWidth = overlayCanvas.width - 16;
            const rectHeight = overlayCanvas.width - 16;
            const rectX = (overlayCanvas.width - rectWidth) / 2;
            const rectY = (overlayCanvas.height - rectHeight) / 2;
            ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);
        },
        getCroppedImageData: function(canvas) {
            const rectWidth = canvas.width;
            const rectHeight = canvas.height * 0.2;
            const rectX = (canvas.width - rectWidth) / 2;
            const rectY = (canvas.height - rectHeight) / 2;
            const croppedCanvas = document.createElement('canvas');
            croppedCanvas.width = rectWidth;
            croppedCanvas.height = rectHeight;
            const croppedContext = croppedCanvas.getContext('2d');
            croppedContext.drawImage(canvas, rectX, rectY, rectWidth, rectHeight, 0, 0, rectWidth, rectHeight);
            return croppedCanvas.toDataURL('image/png');
        },
        getCroppedCanvas: function(canvas) {
            const rectWidth = canvas.width;
            const rectHeight = canvas.height * 0.2;
            const rectX = (canvas.width - rectWidth) / 2;
            const rectY = (canvas.height - rectHeight) / 2;
            const croppedCanvas = document.createElement('canvas');
            croppedCanvas.width = rectWidth;
            croppedCanvas.height = rectHeight;
            const croppedContext = croppedCanvas.getContext('2d');
            croppedContext.drawImage(canvas, rectX, rectY, rectWidth, rectHeight, 0, 0, rectWidth, rectHeight);
            return croppedCanvas;
        },
        ocrReaderRun: function() {
            const video = document.getElementById("ocr-video");
            const output = document.getElementById("ocr-output");
            this.actionButtonTimeStamp = Date.now();
            const actionButton = document.getElementById("ocrReaderActionButton");
            actionButton.textContent = "인식중..";
            actionButton.style.backgroundColor = "#2d5514"; // #7db958
            actionButton.removeEventListener("click", this.ocrReaderRun);
            // OCR 스캔 시간 측정용 - {
            this.actionHistory = {
                uuid: "",
				type: "O",
                userId: "",
				deviceModel: "",
                startTimeStamp: 0,
                tryHistory: [],
            };
            this.actionHistory.uuid = crypto.randomUUID();
            if(this.$parent.session && this.$parent.session.USER_ID) {
                this.actionHistory.userId = this.$parent.session.USER_ID;
            }
			if (navigator.userAgentData) {
				navigator.userAgentData.getHighEntropyValues(["model"]).then(ua => {this.actionHistory.deviceModel = ua.model});
			}
            this.actionHistory.startTimeStamp = Date.now();
            // OCR 스캔 시간 측정용 - }
            
            this.isCaptured = false;
            const canvas = document.createElement("canvas");
            canvas.id = "capture-canvas";
            const context = canvas.getContext("2d");
            const $this = this;

            // 캡처 및 OCR 실행
            async function processFrame() {
                console.log("(Date.now() - this.actionButtonTimeStamp) / (1000 * 60) : " + (Date.now() - $this.actionButtonTimeStamp) / 1000);
                if($this.actionButtonTimeStamp == 0 || ((Date.now() - $this.actionButtonTimeStamp) / 1000 >= $this.actionButtonSecondLimit)) {
                    $this.actionButtonTimeStamp = 0;
                    actionButton.textContent = "인식시작";
                    actionButton.style.backgroundColor = "#7db958"; // #2d5514
                    actionButton.addEventListener("click", $this.ocrReaderRun);
                    return;
                }
                if ($this.isCaptured) return;
                if ($this.isProcessing) {
                    requestAnimationFrame(processFrame);
                    return;
                }
                $this.isProcessing = true;
                $this.ocrString = "";
                $this.processedBase64String = "";
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.style.width = video.videoWidth + "px";
                canvas.style.height = video.videoHeight + "px";
                // 현재 프레임을 캡처하여 캔버스에 그리기
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const capturedImage = canvas.toDataURL("image/png");
                const capturedImageBase64 = capturedImage; // data:image/png;base64, 제거하지 않음
                const data = {
                    image_data: capturedImageBase64,
                }
                // OCR 스캔 시간 측정용 - {
                const tryHistoryItem = {captureTimeStamp: Date.now(), sendTimeStamp: 0, receiveTimeStamp: 0, warebizKdata: "", warebizTime: "", wasStartTimeStamp: 0, wasEndTimeStamp: 0};
                $this.actionHistory.tryHistory.push(tryHistoryItem);
                data.tryHistoryItem = tryHistoryItem;
                // OCR 스캔 시간 측정용 - }
                $this.ocrString = await $this.requestWarebizOcr(data);
                $this.meterNumber = $this.parseMeterId($this.ocrString);
                console.log("OCR 결과:", $this.meterNumber);
                $this.isProcessing = false;
                if ($this.meterNumber) {
                    $this.isCaptured = true; // OCR 중지
                    $this.actionButtonTimeStamp = 0;
                    output.innerHTML = `<p>✅ 감지 완료: ${$this.meterNumber}</p>`;
                    //setTimeout(() => {
                        $this.closeScanner(); // 팝업 자동 닫기
                    //}, 1000); // 1초 후 닫기
                } else {
                    output.innerHTML = "🔍 스캔 중...";
                    setTimeout(() => requestAnimationFrame(processFrame), 50);
                }
            }

            requestAnimationFrame(processFrame);
        },
        startOCRProcessing: function(video, output) {
            // OCR 스캔 시간 측정용 - {
            this.actionHistory = {
                uuid: "",
				type: "O",
                userId: "",
				deviceModel: "",
                startTimeStamp: 0,
                tryHistory: [],
            };
            this.actionHistory.uuid = crypto.randomUUID();
            if(this.$parent.session && this.$parent.session.USER_ID) {
                this.actionHistory.userId = this.$parent.session.USER_ID;
            }
			if (navigator.userAgentData) {
				navigator.userAgentData.getHighEntropyValues(["model"]).then(ua => {this.actionHistory.deviceModel = ua.model});
			}
            this.actionHistory.startTimeStamp = Date.now();
            // OCR 스캔 시간 측정용 - }
            
            this.isCaptured = false;
            if (this.isCaptured) return;

            const canvas = document.createElement("canvas");
            canvas.id = "capture-canvas";
            const context = canvas.getContext("2d");
            const $this = this;

            // 캡처 및 OCR 실행
            async function processFrame() {
                if ($this.isCaptured) return;
                if ($this.isProcessing) {
                    requestAnimationFrame(processFrame);
                    return;
                }
                $this.isProcessing = true;
                $this.ocrString = "";
                $this.processedBase64String = "";
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.style.width = video.videoWidth + "px";
                canvas.style.height = video.videoHeight + "px";
                // 현재 프레임을 캡처하여 캔버스에 그리기
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const capturedImage = canvas.toDataURL("image/png");
                const capturedImageBase64 = capturedImage; // data:image/png;base64, 제거하지 않음
                const data = {
                    image_data: capturedImageBase64,
                }
                // OCR 스캔 시간 측정용 - {
                const tryHistoryItem = {captureTimeStamp: Date.now(), sendTimeStamp: 0, receiveTimeStamp: 0, warebizKdata: "", warebizTime: "", wasStartTimeStamp: 0, wasEndTimeStamp: 0};
                $this.actionHistory.tryHistory.push(tryHistoryItem);
                data.tryHistoryItem = tryHistoryItem;
                // OCR 스캔 시간 측정용 - }
                $this.ocrString = await $this.requestWarebizOcr(data);
                $this.meterNumber = $this.parseMeterId($this.ocrString);
                console.log("OCR 결과:", $this.meterNumber);
                $this.isProcessing = false;
                if ($this.meterNumber) {
                    $this.isCaptured = true; // OCR 중지
                    output.innerHTML = `<p>✅ 감지 완료: ${$this.meterNumber}</p>`;
                    setTimeout(() => {
                        $this.closeScanner(); // 팝업 자동 닫기
                    }, 1000); // 1초 후 닫기
                } else {
                    output.innerHTML = "🔍 스캔 중...";
                    setTimeout(() => requestAnimationFrame(processFrame), 50);
                }
            }

            requestAnimationFrame(processFrame);
        },
        sendBase64: function(parsedString, base64String) {
            let params = {
                "ocrString": encodeURI(parsedString),
                "parsedString": this.meterNumber,
                "imgBase64": base64String
            };
            axios.post("/ami/mob/emr/recevieCroppedImage", {
                params: params,
                loading: false
            });
        },
        closeScanner: function() {
            this.isCaptured = true;
            this.stopCamera();
            if (this.modalBackground) {
                document.body.removeChild(this.modalBackground);
                this.modalBackground.remove();
                this.modalBackground = null;
            }
            if(this.meterNumber) {
                this.$emit("callback");
            }
            // OCR 스캔 시간 측정용 - {
            console.log("closeScanner");
            console.log(this);
            if(this.$parent.session.OCR_HISTORY_RECODE_YN == "Y" && this.actionHistory.uuid != '') {
                axios.post("/ami/mob/emr/api-warebiz-ocr-history",  this.actionHistory, {"Content-Type": "application/json"});
                function formatTimestamp(timestamp) {
                    const date = new Date(timestamp);
                    const yyyy = date.getFullYear();
                    const MM   = String(date.getMonth() + 1).padStart(2, '0'); // 월 (0부터 시작)
                    const dd   = String(date.getDate()).padStart(2, '0');
                    const HH   = String(date.getHours()).padStart(2, '0');
                    const mi   = String(date.getMinutes()).padStart(2, '0');
                    const ss   = String(date.getSeconds()).padStart(2, '0');
                    return `${yyyy}-${MM}-${dd} ${HH}:${mi}:${ss}`;
                }
                function secondsBetweenTimestamp(ts1, ts2) {
                    return Math.abs(ts1 - ts2) / 1000;
                }
                let ocrProcessSeconds = 0;
                let ocrProcessTimeText = "";
                let ocrProcessTimeCsv = "";
                let dataTrasnferSeconds = 0;
                let dataTrasnferTimeCsv = "";
                let dataTrasnferTimeText = "";
                let pictureTrasnferSeconds = 0;
                let pictureTrasnferTimeCsv = "";
                let pictureTrasnferTimeText = "";
                this.actionHistory.tryHistory.forEach(tryHistoryItem => {
                    if(tryHistoryItem.warebizTime != null && tryHistoryItem.warebizTime.length > 0) {
                        ocrProcessSeconds += (tryHistoryItem.warebizTime * 1);
                        if(ocrProcessTimeCsv) {
                            ocrProcessTimeCsv += "," + tryHistoryItem.warebizTime;
                        }
                        else {
                            ocrProcessTimeCsv = tryHistoryItem.warebizTime;
                        }
                        if(tryHistoryItem.captureTimeStamp > 0 && tryHistoryItem.receiveTimeStamp > 0) {
                            dataTrasnferSeconds += (secondsBetweenTimestamp(tryHistoryItem.captureTimeStamp, tryHistoryItem.receiveTimeStamp) - (tryHistoryItem.warebizTime * 1));
                            if(dataTrasnferTimeCsv) {
                                dataTrasnferTimeCsv += "," + (secondsBetweenTimestamp(tryHistoryItem.captureTimeStamp, tryHistoryItem.receiveTimeStamp) - (tryHistoryItem.warebizTime * 1));
                            }
                            else {
                                dataTrasnferTimeCsv = "" + (secondsBetweenTimestamp(tryHistoryItem.captureTimeStamp, tryHistoryItem.receiveTimeStamp) - (tryHistoryItem.warebizTime * 1));
                            }
                        }
                    }
                    if(tryHistoryItem.sendTimeStamp > 0 && tryHistoryItem.wasStartTimeStamp > 0) {
                        pictureTrasnferSeconds += secondsBetweenTimestamp(tryHistoryItem.sendTimeStamp, tryHistoryItem.wasStartTimeStamp);
                        if(pictureTrasnferTimeCsv) {
                            pictureTrasnferTimeCsv += "," + secondsBetweenTimestamp(tryHistoryItem.sendTimeStamp, tryHistoryItem.wasStartTimeStamp);
                        }
                        else {
                            pictureTrasnferTimeCsv = secondsBetweenTimestamp(tryHistoryItem.sendTimeStamp, tryHistoryItem.wasStartTimeStamp);
                        }
                    }
                });
                if(ocrProcessSeconds > 0) {
                    ocrProcessTimeText = `총 ${ocrProcessSeconds}초 (${ocrProcessTimeCsv})`;
                }
                if(dataTrasnferSeconds > 0) {
                    dataTrasnferTimeText = `총 ${dataTrasnferSeconds}초 (${dataTrasnferTimeCsv})`;
                }
                if(pictureTrasnferSeconds > 0) {
                    pictureTrasnferTimeText = `총 ${pictureTrasnferSeconds}초 (${pictureTrasnferTimeCsv})`;
                }
                let text = "전체 동작 시간: " + secondsBetweenTimestamp(this.actionHistory.startTimeStamp, Date.now()) + " 초\n";
                text += "화면-캡쳐-전송 동작 시간: " + dataTrasnferTimeText + "\n";
                text += "사진 전송 시간: " + pictureTrasnferTimeText +  "\n";
                text += "OCR 서버 동작 횟수: " + this.actionHistory.tryHistory.length + " 회\n";
                text += "OCR 서버 동작 시간: " + ocrProcessTimeText + "\n";
                //alert(text);
            }
            // OCR 스캔 시간 측정용 - }
        },
        parseMeterId: function(inputText) {
            let meterId = "";
            if(inputText.indexOf("error") > -1) {
                return meterId;
            }
            let text = "";
            var isTypeNumber = function(typeString) {
                const typeNumberStrings = ["17", "18", "25", "26", "27", "37", "38", "45","46", "47", "19", "51", "52", "53", "54", "55", "56", "57"];
                let isTypeNumberString = false;
                typeNumberStrings.forEach((typeNumberString) => {
                    if(typeString == typeNumberString) {
                        isTypeNumberString = true;
                    }
                });
                return isTypeNumberString;
            }
            if(inputText && inputText.length == 11 && isTypeNumber(inputText.substring(2, 4))) {
                meterId = inputText;
            }
            return meterId;
        },
        requestWarebizOcr: async function(jsonObject) {
            const headers = {
                "Content-Type": "application/json",
            }
            let resultText = "";
            // OCR 스캔 시간 측정용 - {
            jsonObject.tryHistoryItem.sendTimeStamp = Date.now();
            // OCR 스캔 시간 측정용 - }
            await axios
                .post("/ami/mob/emr/api-proxy-warebiz", jsonObject, {headers})
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
                            resultText = resultText.replaceAll("에러발생", "");
                            resultText = resultText.replaceAll("error", "");
                            resultText = resultText.replaceAll("Error", "");
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
        }
    }
});
