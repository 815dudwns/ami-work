/********************************************************************************************
 * @Writer
 *  김동진 2025.03.18
 *  
 * @Description
 * - 2025.06.16 마커 이미지 변경 기능 추가 (시작, 경유, 도착, 기본)
 *
 * @Syntax
 * 	<kakao-map-popup></kakao-map-popup>
 * 
 * @Parameters
 *  locations : 위도, 경도가 포함된 list
 * 		address(or lat, lng)  : 위치 정보
 *      id       : 키값 (DCU_ID, METER_ID, FCTY_ID)
 *      type     : 구분 (DCU, 모뎀, 전력량계)
 *      workStep : 상태값
 ********************************************************************************************/
Vue.component('kakao-map-popup', {
    props: {
        coords: {
            type: Array,
            default: () => []
        },
        type: {
            type: String,
            default: 'coords'
        }
    },
    template: `
		<div>
			<button class="btn type02 size-m left-icon icon-pin secondary" @click="openMapPopup">경로</button>
			<div v-show="visible" id="kakaoMapPopup" :style="popupStyle">
				<div :style="mapToolbarStyle">
					<div>경유지 {{vias.length}}개 | 도착지 {{destination? '설정됨':'미설정'}}</div>
					<div style="display:flex; justify-content:space-between;">
						<div style="margin-top:12px;margin-right:30px;">
							<input v-model="toggleBtn" id="toggle-on" class="toggle toggle-left" name="toggle" value="false" type="radio">
							<label for="toggle-on" class="toggle-btn">스카이뷰</label>
							<input v-model="toggleBtn" id="toggle-off" class="toggle toggle-right" name="toggle" value="true" type="radio">
							<label for="toggle-off" class="toggle-btn">로드뷰</label>
						</div>
						<button @click="close" :style="closeBtnStyle">×</button>
					</div>
				</div>
				<div id="popupMapContainer" :style="popupMapContainerStyle">
				</div>
				<button :style="searchRouteButtonStyle" @click="searchRoute">
					<svg style="padding: 7px 8px 9px 9px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M256 32l-74.8 0c-27.1 0-51.3 17.1-60.3 42.6L3.1 407.2C1.1 413 0 419.2 0 425.4C0 455.5 24.5 480 54.6 480L256 480l0-64c0-17.7 14.3-32 32-32s32 14.3 32 32l0 64 201.4 0c30.2 0 54.6-24.5 54.6-54.6c0-6.2-1.1-12.4-3.1-18.2L455.1 74.6C446 49.1 421.9 32 394.8 32L320 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64zm64 192l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg>
				</button>
				<div :style="noticeBoxStyle" id="noticeBox">
				</div>
			</div>
		</div>
    `,
    data() {
		let kakaoKey;
		if (window.location.hostname === 'awms.kdn.com') {
		    kakaoKey = '184101906e855347c426bdc750048414'; 
		} else {
		    kakaoKey = 'a4d822ea5f046a95bc42e0ac7b7cc7eb';
		}
        return {
            visible: false,
            map: null,
            currentPosition: null,
            markers: [],
            overlays: [], 
            destination: null,
            destinationOverlay: null,
            viaOverlays: [],
            vias: [],
            alladdress: [],
            targetmarkers: {
                via: [],
                end: null
            },
			noticeTimeout: null,
            // 마커 이미지 객체
            departImage: null,
            arriveImage: null,
            throughImage: null,
			kakaoJavascriptKey: kakaoKey,
			currentTypeId: 'ROADMAP',
			toggleBtn: 'true',
			overlayZIndex: 100,
        };
    },
    watch: {
		toggleBtn: function(val){
			this.setOverlayMapTypeId(val=='true'?'roadmap':'hybrid')
		},
	},
    computed: {
        popupStyle() {
            return {
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '95vw',
                height: '85vh',
                zIndex: '10000',
                background: '#fff',
                border: '1px solid #ccc',
                borderRadius: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                overflow: 'hidden'
            };
        },
        closeBtnStyle() {
            return {
                position: 'absolute',
                top: '10px',
                right: '14px',
                fontSize: '24px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                zIndex: '21'
            };
        },
        popupMapContainerStyle() {
            return {
                width: '100%',
                height: '100%',
            };
        },
		searchRouteButtonStyle(){
			return {
				position: 'absolute',
				bottom: '90px',
				right: '30px',
				width: '44px',
				height: '44px',
				background: 'white',
				border: '1px solid #ccc',
				borderRadius: '50%',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: '10',
			};
		},
		noticeBoxStyle(){
			return {
				position: 'absolute',
				top: '60px',
				left: '50%',
				transform: 'translateX(-50%)',
				background: '#333',
				color: 'white',
				padding: '8px 16px',
				borderRadius: '6px',
				fontSize: '0.85rem',
				zIndex: '1000',
				display: 'none',
				whiteSpace: 'nowrap',
			};
		},
		mapToolbarStyle() {
			return {
				position: 'absolute',
				top: '0',
				left: '0',
				right: '0',
				height: '50px',
				background: 'white',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				padding: '0 12px',
				boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
				zIndex: '20',
			}
		},
    },
    methods: {
        close() {
            this.visible = false;

            if (this.map) {
                this.markers.forEach(marker => marker.setMap(null));
                this.markers = [];

                this.overlays.forEach(overlay => overlay.setMap(null)); // CustomOverlay 제거
                this.overlays = []; // CustomOverlay 제거

                this.vias.forEach(marker => marker.setMap(null));
                this.vias = [];

                this.viaOverlays.forEach(o => o.setMap(null)); // CustomOverlay 제거
                this.viaOverlays = []; // CustomOverlay 제거

                if (this.destination) {
                    this.destination.setMap(null);
                    this.destination = null;
                }
				if (this.countOverlays) {
				  this.countOverlays.forEach(o => o && o.setMap(null));
				  this.countOverlays = [];
				}
                if (this.destinationOverlay) { // CustomOverlay 제거
                    this.destinationOverlay.setMap(null); // CustomOverlay 제거
                    this.destinationOverlay = null; // CustomOverlay 제거
                }
				this.toggleBtn = "true"
                this.map = null;
            }

            this.targetmarkers = {
                via: [],
                end: null
            };

            this.alladdress = [];
            this.departImage = null;
            this.arriveImage = null;
            this.throughImage = null;
            document.querySelector('header').style.zIndex = '';
            document.getElementById('popupMapContainer').innerHTML = '';
        },
        openMapPopup() {
            if(this.coords.length == 0){
                notifySubmit('error', '선택항목없음', '선택된 항목이 없습니다', 'icon-caution');
                return;
            }else if(this.coords.some(item => item.workStep == '29')){
                notifySubmit('error', '전송항목존재', '이미 전송한 항목이 존재합니다', 'icon-caution');
                return;
            }else if(this.coords.some(item => item.workStep == '28')){
                notifySubmit('error', '완료항목존재', '이미 완료한 항목이 존재합니다', 'icon-caution');
                return;
            };

            document.body.classList.add('loading-indicator');
            this.visible = true;
            this.$nextTick(() => {
                setTimeout(() => {
                    this.loadKakaoScripts();
                }, 100); // 최소 50~100ms 딜레이
            });
        },
        loadKakaoScripts() {
            if (window.kakao && window.kakao.maps) {
                this.initMap();
                return;
            }

            if (!document.getElementById('kakao-map-sdk')) {
                const script = document.createElement('script');
                script.id = 'kakao-map-sdk';
                script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${this.kakaoJavascriptKey}&autoload=false&libraries=services`;
                script.onload = () => {
                    kakao.maps.load(() => {
                        this.initMap();
                    });
                };
                document.body.appendChild(script);
                document.querySelector('header').style.zIndex = '10';
                this.loadKakaoNaviSDK();
            }
        },
        loadKakaoNaviSDK() {
            if (window.Kakao && window.Kakao.Navi) return;

            if (!document.getElementById('kakao-navi-sdk')) {
                const sdk = document.createElement('script');
                sdk.id = 'kakao-navi-sdk';
                sdk.src = "https://developers.kakao.com/sdk/js/kakao.min.js";
                sdk.onload = () => {
                    if (window.Kakao && !Kakao.isInitialized()) {
                        Kakao.init(this.kakaoJavascriptKey);
                    }
                };
                document.head.appendChild(sdk);
            }
        },
        initMap() {
            var self = this;
            const imageSize = new kakao.maps.Size(30, 40);
            this.departImage = new kakao.maps.MarkerImage('/images/ami/icon_depart.png', imageSize);
            this.arriveImage = new kakao.maps.MarkerImage('/images/ami/icon_arrive.png', imageSize);
            this.throughImage = new kakao.maps.MarkerImage('/images/ami/icon_through.png', imageSize);

            navigator.geolocation.getCurrentPosition((position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                const currentPosition = new kakao.maps.LatLng(lat, lon);
                this.map = new kakao.maps.Map(document.getElementById('popupMapContainer'), {
                    center: currentPosition,
                    level: 5
                });

                const marker = new kakao.maps.Marker({
                    position: currentPosition,
                    map: this.map,
                    image: this.departImage // 시작지 마커 이미지 설정
                });

                const geocoder = new kakao.maps.services.Geocoder();

                geocoder.coord2Address(lon, lat, (result, status) => {
                    if (status === kakao.maps.services.Status.OK) {
                        const address = result[0].road_address?.address_name || result[0].address.address_name;
                        const content = `<div class="wrap" style="${this.infoWindowStyle()} bottom: 40px;">` + // CustomOverlay 컨텐츠
                                        '    <div class="info">' +
                                        '        <div class="title">' +
                                        '            <strong>현재 위치</strong>' +
                                        '        </div>' +
                                        `        <div class="body" style="text-align: left;">${address}</div>` +
                                        '    </div>' +
                                        '</div>';

                        const currentOverlay = new kakao.maps.CustomOverlay({
                            content: content,
                            map: this.map,
                            position: currentPosition,
                            yAnchor: 1.2 // 마커 위쪽으로 오버레이 표시
                        });
                        this.overlays[-1] = currentOverlay; // 현재 위치 오버레이는 특별히 -1 인덱스 사용 (임시)
                    }
                });

                const placeGeocoder = new kakao.maps.services.Geocoder();

                const handleMarker = (coord, index, lat, lng) => {
                    const latlng = new kakao.maps.LatLng(lat, lng);

                    const markerOptions = {
                        position: latlng,
                        map: this.map
                    };


                    if (coord.markerType) {
                        const imageSrc = `/images/ami/marker${coord.markerType}.png`;
                        const imageSize = new kakao.maps.Size(30, 40);
                        const markerImage = new kakao.maps.MarkerImage(imageSrc, imageSize);

                        markerOptions.image = markerImage;
                    }

                    const marker = new kakao.maps.Marker(markerOptions);

                    placeGeocoder.coord2Address(lng, lat, (result, status) => {
                        if (status === kakao.maps.services.Status.OK) {
                            const address = result[0].road_address?.address_name || result[0].address.address_name;
                            this.alladdress[index] = address;

                            const content = `<div class="wrap" style="${this.infoWindowStyle()} bottom: 27px;">` + // CustomOverlay 컨텐츠
                                            '    <div class="info">' +
                                            '        <div class="title">' +
                                            `            <div>구분 : ${coord.type}</div>` +
                                            `            <div class="close overlay-close" onclick="closeOverlay(${index})" title="닫기" style="position: absolute; top: 0px; right: 12px; background: transparent; border: none; font-size: 30px; cursor: pointer;">×</div>` +
                                            '        </div>' +
                                            `        <div class="body"><div>대상ID : <strong>${coord.id}</strong></div>` +
                                            `            <div style="margin-top: 8px; display: flex; justify-content: center; flex-wrap: wrap; gap: 5px;">` +
                                            `                <button style="${this.viaBtnStyle()}" onclick="addViaPoint(${index})">경유</button>` +
                                            `                <button style="${this.destinationBtnStyle()}" onclick="setAsDestination(${index})">도착</button>` +
                                            `            </div>` +
                                            `        </div>` +
                                            `    </div>` +
                                            `</div>`;

                            const customOverlay = new kakao.maps.CustomOverlay({
                                content: content,
                                map: null, // 초기에는 지도에 표시하지 않음
                                position: latlng,
                                yAnchor: 1.2
                            });

							/*
                            kakao.maps.event.addListener(marker, 'click', () => {
								// 모든 오버레이 닫기 (선택적: 기존에 열려있는 다른 오버레이를 닫고 싶을 경우)
								//this.overlays.forEach(o => o.setMap(null)); // 일반 마커 오버레이
								//this.viaOverlays.forEach(o => o.setMap(null)); // 경유지 오버레이
								//if(this.destinationOverlay) this.destinationOverlay.setMap(null); // 도착지 오버레이

								const selectedMarker = marker; // 클릭된 마커
								const selectedPos = selectedMarker.getPosition(); // 클릭된 마커의 위치

								// 클릭된 마커가 경유지인지 확인
								const isVia = this.vias.some(v => v.getPosition().toString() === selectedPos.toString());
								// 클릭된 마커가 도착지인지 확인
								const isDestination = this.destination && this.destination.getPosition().toString() === selectedPos.toString();

								if (isVia) {
								    // 경유지 오버레이를 찾아서 보여줍니다.
								    const viaIndex = this.vias.findIndex(v => v.getPosition().toString() === selectedPos.toString());
								    if (viaIndex !== -1 && this.viaOverlays[viaIndex]) {
								        this.viaOverlays[viaIndex].setMap(this.map);
								    }
								} else if (isDestination) {
								    // 도착지 오버레이를 보여줍니다.
								    if (this.destinationOverlay) {
								        this.destinationOverlay.setMap(this.map);
								    }
								} else {
								    // 경유지나 도착지가 아니면 일반 마커 오버레이를 보여줍니다.
								    const index = this.markers.indexOf(selectedMarker); // markers 배열에서 해당 마커의 인덱스 찾기
								    if (index !== -1 && this.overlays[index]) {
								        this.overlays[index].setMap(this.map);
								    }
								}
                            });
							*/
							kakao.maps.event.addListener(marker, 'click', () => {
							  this.overlayZIndex += 1;

							  const role = marker.__role || 'normal';
							  const targetOverlay = marker.__overlays[role];

							  if (targetOverlay) {
							    targetOverlay.setZIndex(this.overlayZIndex);
							    targetOverlay.setMap(this.map);
							  }
							});

                            this.markers[index] = marker;
                            this.overlays[index] = customOverlay; // CustomOverlay 추가

                            //customOverlay.setMap(this.map); // 초기 로드 시 오버레이도 표시
                        }
                    });
                };

                if (this.type === 'address') {
					const groupedCoords = this.groupByAddress(this.coords);
					groupedCoords.forEach((group, index) => {
					  placeGeocoder.addressSearch(group.address, (result, status) => {
					    if (status !== kakao.maps.services.Status.OK) return;

					    const lat = result[0].y;
					    const lng = result[0].x;

					    this.createGroupedMarker(group, lat, lng, index);
					  });
					});
                    document.body.classList.remove('loading-indicator');
                    
                } else {
                    this.coords.forEach((coord, index) => {
                        handleMarker(coord, index, coord.lat, coord.lng);
                    });
                    document.body.classList.remove('loading-indicator');
                }
            });
        },
        closeOverlay(index) { // CustomOverlay 닫기 함수
			// index는 숫자(배열 인덱스)로 들어옴
			const marker = this.markers[index];
			if (!marker) return;

			const role = marker.__role || 'normal';
			marker.__overlays?.[role]?.setMap(null);
        },
		closeOverlayByMarker(marker) {
		  const role = marker.__role || 'normal';
		  marker.__overlays[role]?.setMap(null);
		},
        setAsDestination(index) {
            const selectedMarker = this.markers[index];
            const selectedPos = selectedMarker.getPosition();

            const isSame = this.destination && this.destination === selectedMarker;

            if (isSame) {
                this.showNotice("이미 선택된 도착지입니다.");
                return;
            }

            // 이전에 설정된 도착지가 있다면, 해당 마커의 아이콘을 원래대로 되돌림
            if (this.destination) {
                this.resetMarkerIcon(this.destination);
            }

            // 경유지에 포함되어 있다면 제거
            const viaIndex = this.vias.findIndex(v => v.getPosition().toString() === selectedPos.toString());
            if (viaIndex !== -1) {
                this.vias.splice(viaIndex, 1);
                this.targetmarkers.via.splice(viaIndex, 1);
                this.viaOverlays[viaIndex].setMap(null); 
                this.viaOverlays.splice(viaIndex, 1);
            }

            // 기존 도착지 마커 지도에 다시 표시 (아이콘 리셋은 위에서 처리)
            if (this.destinationOverlay) this.destinationOverlay.setMap(null); // CustomOverlay 제거
            if (this.destination) this.destination.setMap(this.map);

            selectedMarker.setImage(this.arriveImage); // 도착지 아이콘으로 변경
            this.destination = selectedMarker;
            this.targetmarkers.end = selectedMarker;

            this.showNotice("도착지로 설정되었습니다");
			const address = selectedMarker.__address || '';
			
            const content = `<div class="wrap" style="${this.infoWindowStyle()} bottom: 27px;">` + // CustomOverlay 컨텐츠
                            '    <div class="info">' +
                            '        <div class="title">' +
                            `            <strong style='color:#f44336'>도착지</strong>` +
							`            <div class="close" onclick="closeDestinationOverlay()" title="닫기" style="position: absolute; top: 0px; right: 12px; background: transparent; border: none; font-size: 30px; cursor: pointer;">×</div>` +							
                            '        </div>' +
                            `        <div class="body" style="text-align: left;">${address}</div>` +
							`        <div style="margin-top: 8px; display: flex; justify-content: center; flex-wrap: wrap; gap: 5px;">` +
							`        	<button style="${this.cancelBtnStyle()}" onclick="cancelPoint(${index})">취소</button>` +
							`        </div>` +
                            `    </div>` +
                            `</div>`;
							
            const destinationCustomOverlay = new kakao.maps.CustomOverlay({
                content: content,
                map: this.map,
                position: selectedPos,
                yAnchor: 1.2
            });
            this.destinationOverlay = destinationCustomOverlay; // CustomOverlay 추가

            this.overlays[index].setMap(null); // CustomOverlay 닫기
			
			selectedMarker.__role = 'destination';
			selectedMarker.__overlays.destination = destinationCustomOverlay;
			selectedMarker.__overlays.normal?.setMap(null);
			
			this.overlayZIndex += 1;
			const role = selectedMarker.__role || 'normal';
			const targetOverlay = selectedMarker.__overlays?.[role];

			if (targetOverlay) {
			  targetOverlay.setZIndex(this.overlayZIndex);
			  targetOverlay.setMap(this.map);
			}
        },

        addViaPoint(index) {
            if (this.vias.length >= 3) {
                this.showNotice("경유지는 최대 3개까지 설정할 수 있습니다.");
                this.overlays[index].setMap(null); // CustomOverlay 닫기
                return;
            }

            const selectedMarker = this.markers[index];
            const selectedPos = selectedMarker.getPosition();

            // 도착지일 경우 해제 (아이콘 변경은 아래에서 처리)
            if (this.destination && this.destination === selectedMarker) {
                this.destination = null;
                if (this.destinationOverlay) { 
                    this.destinationOverlay.setMap(null); 
                    this.destinationOverlay = null; 
                }
                this.targetmarkers.end = null;
            }

            // 이미 경유지인지 확인
            if (this.vias.some(v => v === selectedMarker)) {
                this.showNotice("이미 선택된 경유지입니다.");
                this.overlays[index].setMap(null);
                return;
            }

            this.showNotice("경유지로 설정되었습니다");

            selectedMarker.setImage(this.throughImage); // 경유지 아이콘으로 변경
            this.vias.push(selectedMarker);
            this.targetmarkers.via.push(selectedMarker);
			const address = selectedMarker.__address || '';

            const content = `<div class="wrap" style="${this.infoWindowStyle()} bottom: 27px;">` + // CustomOverlay 컨텐츠
                            '    <div class="info">' +
                            '        <div class="title">' +
                            `            <strong style='color:#4CAF50'>경유지</strong>` +
							`            <div class="close" onclick="closeViaOverlay(${this.viaOverlays.length})" title="닫기" style="position: absolute; top: 0px; right: 12px; background: transparent; border: none; font-size: 30px; cursor: pointer;">×</div>` +
                            '        </div>' +
                            `        <div class="body" style="text-align: left;">${address}</div>` +
							`        <div style="margin-top: 8px; display: flex; justify-content: center; flex-wrap: wrap; gap: 5px;">` +
							`        	<button style="${this.cancelBtnStyle()}" onclick="cancelPoint(${index})">취소</button>` +
							`        </div>` +							
                            `    </div>` +
                            `</div>`;

            const viaCustomOverlay = new kakao.maps.CustomOverlay({
                content: content,
                map: this.map,
                position: selectedPos,
                yAnchor: 1.2
            });
            this.viaOverlays.push(viaCustomOverlay); // CustomOverlay 추가

            this.overlays[index].setMap(null); // CustomOverlay 닫기
			
			selectedMarker.__role = 'via';
			selectedMarker.__overlays.via = viaCustomOverlay;
			selectedMarker.__overlays.normal?.setMap(null);
			
			this.overlayZIndex += 1;
			const role = selectedMarker.__role || 'normal';
			const targetOverlay = selectedMarker.__overlays?.[role];

			if (targetOverlay) {
			  targetOverlay.setZIndex(this.overlayZIndex);
			  targetOverlay.setMap(this.map);
			}
        },
		cancelPoint(index) {
			const selectedMarker = this.markers[index];
			const selectedPos = selectedMarker.getPosition();

			// 도착지일 경우 해제
			if (this.destination && this.destination === selectedMarker) {
			    this.destination = null;
			    if (this.destinationOverlay) { 
			        this.destinationOverlay.setMap(null); 
			        this.destinationOverlay = null;
			    }
			    this.targetmarkers.end = null;
			}

			// 경유지에 포함되어 있다면 제거
			const viaIndex = this.vias.findIndex(v => v.getPosition().toString() === selectedPos.toString());
			if (viaIndex !== -1) {
			    this.vias.splice(viaIndex, 1);
			    this.targetmarkers.via.splice(viaIndex, 1);
			    this.viaOverlays[viaIndex].setMap(null); // CustomOverlay 제거
			    this.viaOverlays.splice(viaIndex, 1); // CustomOverlay 제거
			}
			// 마커 아이콘을 원래 상태로 되돌림
			this.resetMarkerIcon(selectedMarker);
			
			selectedMarker.__role = 'normal';
			selectedMarker.__overlays.via?.setMap(null);
			selectedMarker.__overlays.destination?.setMap(null);
		},
		
		// 마커 아이콘을 원래 상태로 되돌리는 함수
		resetMarkerIcon(marker) {
			
			if (marker.__markerType) {
			  const imageSrc = `/images/ami/marker${marker.__markerType}.png`;
			  const imageSize = new kakao.maps.Size(30, 40);
			  marker.setImage(new kakao.maps.MarkerImage(imageSrc, imageSize));
			  return;
			}
			
		    const markerIndex = this.markers.indexOf(marker);
		    if (markerIndex === -1) return;

		    const originalCoord = this.coords[markerIndex];
		    if (originalCoord && originalCoord.markerType) {
		        // 원래 지정된 커스텀 마커가 있었던 경우
		        const imageSrc = `/images/ami/marker${originalCoord.markerType}.png`;
		        const imageSize = new kakao.maps.Size(30, 40);
		        const originalImage = new kakao.maps.MarkerImage(imageSrc, imageSize);
		        marker.setImage(originalImage);
		    } else {
		        // 기본 마커였던 경우
		        marker.setImage(null);
		    }
		},
        searchRoute() {
            if (!this.targetmarkers.end) {
                this.showNotice("도착지 없음");
                return;
            }

            const endPos = this.targetmarkers.end.getPosition();
            const end = {
                name: "도착지",
                x: endPos.getLng(),
                y: endPos.getLat()
            };

            const viaList = this.targetmarkers.via.slice(0, 3).map((marker, idx) => {
                const pos = marker.getPosition();
                return {
                    name: `경유지${idx + 1}`,
                    x: pos.getLng(),
                    y: pos.getLat()
                };
            });

            Kakao.Navi.start({
                name: end.name,
                x: end.x,
                y: end.y,
                coordType: 'wgs84',
                routeInfo: true,
                viaPoints: viaList
            });
        },
        // 마커 아이콘을 원래 상태로 되돌리는 함수
		/*
        resetMarkerIcon(marker) {
            const markerIndex = this.markers.indexOf(marker);
            if (markerIndex === -1) return;

            const originalCoord = this.coords[markerIndex];
            if (originalCoord && originalCoord.markerType) {
                // 원래 지정된 커스텀 마커가 있었던 경우
                const imageSrc = `/images/ami/marker${originalCoord.markerType}.png`;
                const imageSize = new kakao.maps.Size(30, 40);
                const originalImage = new kakao.maps.MarkerImage(imageSrc, imageSize);
                marker.setImage(originalImage);
            } else {
                // 기본 마커였던 경우
                marker.setImage(null);
            }
        },
		*/
        showNotice(msg, time = 2000) {
            const box = document.getElementById('noticeBox');
            if (!box) return;

            box.innerText = msg;
            box.style.display = 'block';

            if (this.noticeTimeout) clearTimeout(this.noticeTimeout);

            this.noticeTimeout = setTimeout(() => {
                box.style.display = 'none';
                this.noticeTimeout = null;
            }, time);
        },
		
		closeDestinationOverlay() { // 새로 추가: 도착지 오버레이만 닫는 함수
		    if (this.destinationOverlay) {
		        this.destinationOverlay.setMap(null);
		        // 필요하다면 this.destinationOverlay = null; 도 추가할 수 있습니다.
		    }
		},
		closeViaOverlay(index) { // 새로 추가: 특정 경유지 오버레이만 닫는 함수
		    if (this.viaOverlays[index]) {
		        this.viaOverlays[index].setMap(null);
		    }
		},
		setOverlayMapTypeId(maptype){
			var changeMaptype;

			// maptype에 따라 지도에 추가할 지도타입을 결정합니다
			if (maptype === 'hybrid'){
			    changeMaptype = kakao.maps.MapTypeId.HYBRID;
			} else if (maptype === 'roadmap'){
				changeMaptype = kakao.maps.MapTypeId.ROADMAP;
			} else {
				return;
			}

			this.map.setMapTypeId(changeMaptype);
			this.currentTypeId = changeMaptype;        
		},
		groupByAddress(coords) {
		    const map = new Map();
		    const typeOrder = {
		        'DCU': 1,
		        '모뎀': 2,
		        '전력량계': 3
		    };

		    coords.forEach(item => {
		        const address = item.address?.trim();
		        if (!address) return;

		        if (!map.has(address)) {
		            map.set(address, {
		                address,
		                markerType: item.markerType,
		                items: []
		            });
		        } else {
					const group = map.get(address);
					group.markerType = Math.min(group.markerType, item.markerType);
					//가장 낮은 값으로 처리
				}

		        map.get(address).items.push({
		            id: item.id,
		            type: item.type,
		            order: typeOrder[item.type] ?? 99
		        });
		    });

		    return Array.from(map.values()).map(group => {
		        group.items.sort((a, b) => {
		            if (a.order !== b.order) return a.order - b.order;
		            return String(a.id).localeCompare(String(b.id));
		        });

		        return group;
		    });
		},
		createGroupedMarker(group, lat, lng, index) {
			const latlng = new kakao.maps.LatLng(lat, lng);

			const marker = new kakao.maps.Marker({
			    position: latlng,
			    map: this.map,
			    image: group.markerType
			        ? new kakao.maps.MarkerImage(
			                `/images/ami/marker${group.markerType}.png`,
			                new kakao.maps.Size(30, 40)
			            )
			        : null
			});

			const MAX_VISIBLE = 10;

			const visibleItems = group.items.slice(0, MAX_VISIBLE);
			const hiddenCount = group.items.length - MAX_VISIBLE;

			const idListHtml = visibleItems
			    .map(item => `<li>${item.type} : <strong>${item.id}&nbsp;${this.getType(item.id, item.type)}</strong></li>`)
			    .join('');

			const moreHtml = hiddenCount > 0
			    ? `<li style="opacity:0.7;">... 외 ${hiddenCount}건</li>`
			    : '';

			const content = `
                <div class="wrap" style="${this.infoWindowStyle()} bottom:27px;">
                    <div class="info">
	                    <div class="overlay-title">
                            <strong class="overlay-address">${group.address}</strong>
                            <div class="close overlay-close" onclick="closeOverlay(${index})">×</div>
	                    </div>
	                    <div class="body">
                            <ul style="padding-left:15px; text-align:left;">
                                ${idListHtml}
                				${moreHtml}
                            </ul>
	                    </div>
                    <div class="footer">
                        <div style="margin-top: 8px; display: flex; justify-content: center; flex-wrap: wrap; gap: 5px;">
                                <button style="${this.viaBtnStyle()}" onclick="addViaPoint(${index})">경유</button>
                                <button style="${this.destinationBtnStyle()}" onclick="setAsDestination(${index})">도착</button>
                        </div>
                    </div>
                    </div>
                </div>
			`;
			const overlay = new kakao.maps.CustomOverlay({
			    content,
			    position: latlng,
			    map: null,
			    yAnchor: 1.2
			});

			marker.__address = group.address;
			marker.__role = 'normal';
			marker.__overlays = {
			    normal: overlay,
			    via: null,
			    destination: null
			};
			marker.__markerType = group.markerType;

			kakao.maps.event.addListener(marker, 'click', () => {
			    this.overlayZIndex += 1;

			    const role = marker.__role || 'normal';
			    const targetOverlay = marker.__overlays?.[role];

			    if (targetOverlay) {
			        targetOverlay.setZIndex(this.overlayZIndex);
			        targetOverlay.setMap(this.map);
			    }
			});

			const countOverlay = this.createCountOverlay(latlng, group.items.length);
			countOverlay.setMap(this.map);

			this.markers[index] = marker;
			this.overlays[index] = overlay;

			if (!this.countOverlays) this.countOverlays = [];
			this.countOverlays[index] = countOverlay;
		  
		},
		getType(id, type){
			var meterType = '';
			if(type == '전력량계'){
				const code = id.substring(2, 4);
				const types = {
			        '표준': ['01', '03', '14', '15', '16', '34', '35', '36'],
			        'E-type': ['17', '18'],
			        'G-type': ['25', '26', '27', '37', '38', '45', '46', '47'],
			        'Adv-E': ['19'],
			        'AMIGO': ['51', '52', '53', '54', '55', '56', '57', '58'],
				}
				meterType = Object.entries(types).find(([_, values]) => values.includes(code))?.[0] || '';
			}
			return meterType;
		},
		createCountOverlay(latlng, count) {
		  const content = `
		    <div style="
		      position: relative;
		      transform: translate(6%, -110%);
		      font-size: 13px;
		      font-weight: bold;
		      color: white;
		      background: rgba(0,0,0,0.7);
		      border-radius: 12px;
		      min-width: 22px;
		      height: 22px;
		      line-height: 22px;
		      text-align: center;
		      pointer-events: none;
		    ">
		      ${count}
		    </div>
		  `;

		  return new kakao.maps.CustomOverlay({
		    content,
		    position: latlng,
		    yAnchor: 0.5,
		    xAnchor: 0.5,
		    zIndex: 50
		  });
		},
		
        infoWindowStyle() {
            // CustomOverlay의 스타일을 위한 추가 CSS
            return `
                padding: 10px;
				min-width: 200px;
                font-size: 13px;
                box-sizing: border-box;
                justify-content: center;
                display: flex;
                flex-direction: column;
                align-items: center;
                background: white;
                border: 1px solid #ccc;
                border-radius: 6px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                position: relative; /* 닫기 버튼 위치를 위해 추가 */
				left: 1.5px;
				text-align: left !important;
            `;
        },
        destinationBtnStyle() {
            return `
                background-color: #f44336;
                border: none;
                color: white;
                padding: 6px 12px;
                margin-top: 5px;
                cursor: pointer;
                font-size: 10px;
                border-radius: 4px;
                width: 50px;
                height: 50px;
            `;
        },
        viaBtnStyle() {
            return `
                background-color: #4CAF50;
                border: none;
                color: white;
                padding: 6px 12px;
                margin-top: 5px;
                cursor: pointer;
                font-size: 10px;
                border-radius: 4px;
                width: 50px;
                height: 50px;
            `;
        },
		cancelBtnStyle(){
			return `
				background-color: #f44336;
				border: none;
				color: white;
				padding: 6px 12px;
				margin-top: 5px;
				cursor: pointer;
				font-size: 10px;
				border-radius: 4px;
				width: 50px;
				height: 50px;
			`;
		},
    },
    mounted() {
        window.closeOverlay = this.closeOverlay.bind(this); // CustomOverlay 닫기 함수 바인딩
        window.closeDestinationOverlay = () => { if (this.destinationOverlay) this.destinationOverlay.setMap(null); }; // 도착지 오버레이 닫기
        window.closeViaOverlay = (index) => { if (this.viaOverlays[index]) this.viaOverlays[index].setMap(null); }; // 경유지 오버레이 닫기

		window.cancelPoint = this.cancelPoint.bind(this);
        window.addViaPoint = this.addViaPoint.bind(this);
        window.setAsDestination = this.setAsDestination.bind(this);
		
		window.closeDestinationOverlay = this.closeDestinationOverlay.bind(this);
		window.closeViaOverlay = this.closeViaOverlay.bind(this);
		const style = document.createElement('style');
		style.innerHTML = `
		.toggle-btn{
		    border: 2px solid #1a1a1a;
		    display: inline-block;
		    padding: 10px;
		    position: relative;
		    text-align: center;
		    transition: background 600ms ease, color 600ms ease;
			width: 80px;
			height: 30px;
			line-height: 5px;
		}

		input[type="radio"].toggle {
		    display: none;
		    & + label{
		        cursor: pointer;
		        min-width: 60px;
		        &:hover{
		            background: none;
		            color: #1a1a1a;
		        }
		        &:after{
		            background: #1a1a1a;
		            content: "";
		            height: 100%;
		            position: absolute;
		            top: 0;
		            transition: left 200ms cubic-bezier(0.77, 0, 0.175, 1);
		            width: 100%;
		            z-index: -1;
		        }
		    }
		    &.toggle-left + label {
		        border-right: 0;
		        &:after{
		            left: 100%
		        }
		    }
		    &.toggle-right + label{
		        margin-left: -5px;
		        &:after{
		            left: -100%;
		        }
		    }
		    &:checked + label {
		        cursor: default;
		        color: #fff;
		        transition: color 200ms;
		        &:after{
		            left: 0;
		        }
		    }
		}
		
		.overlay-address {
			max-width: 300px;
			min-width: 200px;
			flex: 1;
			white-space: normal;
			word-break: break-word;
			line-height: 1.3;
		}
		.wrap .overlay-title {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 8px;
			margin-bottom: 10px;
		}
		.overlay-close {
			font-size: 30px;
			line-height: 15px;	
		}
		`;
		document.head.appendChild(style);		
    },
});