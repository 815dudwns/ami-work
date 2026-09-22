/********************************************************************************************
 * @Writer
 *  김동진 2025.03.18
 *  
 * @Description
 * 	NaverMapUrlSchemeTemplate 현위치를 받아 가장 가까운 위치와 먼 위치를 지정 후 Naver App 호출하는 Template
 * 
 * @Syntax
 *  $.get('/assets/cf_component/template/NaverMapUrlSchemeTempalte.html', function(response){
 *		$('head').append(response); 
 *	});
 * 	<navermap-urlscheme></navermap-urlscheme>
 * 
 * @Parameters
 *  locations : 위도, 경도가 포함된 list
 ********************************************************************************************/
/*
<div>
    <h1>내 위치 기반 경로 계산</h1>
    <button @click="calculateRoute">현재 위치로 경로 계산</button>
    <div v-if="errorMessage" style="color: red;">
        {{ errorMessage }}
    </div>
    <div v-if="currentLocation" class="result">
        <p>현재 위치: 위도 {{ currentLocation.lat.toFixed(4) }}, 경도 {{ currentLocation.lng.toFixed(4) }}</p>
        <p>출발지: {{ route.start ? route.start.name : '' }}</p>
        <p>경유지: {{ route.waypoints.map(w => w.name).join(', ') }}</p>
        <p>도착지: {{ route.end ? route.end.name : '' }}</p>
        <a :href="naverMapUrl" target="_blank" v-if="naverMapUrl">네이버 지도에서 경로 보기</a>
    </div>
</div>
 */
 Vue.component('navermap-urlscheme', {
	 props: ['locations'],
     template: `
	     <button class="btn type02 size-m left-icon icon-pin secondary" @click="filterLocations()">경로</button>
     `,
     data() {
         return {
             currentLocation: null,
             route: {
                 start: null,
                 waypoints: [],
                 end: null
             },
             errorMessage: "",
             naverMapUrl: "",
			 /*
             locations: [
                 { name: "부산", lat: 35.1796, lng: 129.0756 },
                 { name: "대구", lat: 35.8714, lng: 128.6014 },
                 { name: "인천", lat: 37.4563, lng: 126.7052 },
                 { name: "제주", lat: 33.4890, lng: 126.4983 },
             ],
			 */
			 filteredResult:[],
         };
     },
     methods: {
         getDistance(lat1, lng1, lat2, lng2) {
             const R = 6371;
             const dLat = (lat2 - lat1) * Math.PI / 180;
             const dLng = (lng2 - lng1) * Math.PI / 180;
             const a = 
                 Math.sin(dLat/2) * Math.sin(dLat/2) +
                 Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
                 Math.sin(dLng/2) * Math.sin(dLng/2);
             const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
             return R * c;
         },
         
         calculateRouteFromList(myLat, myLng, locationList) {
             const locationsWithDistance = locationList.map(location => ({
                 ...location,
                 distance: this.getDistance(myLat, myLng, location.lat, location.lng)
             }));
             locationsWithDistance.sort((a, b) => a.distance - b.distance);
             this.route.start = locationsWithDistance[0];
             this.route.end = locationsWithDistance[locationsWithDistance.length - 1];
             this.route.waypoints = locationsWithDistance.slice(1, -1);
             this.generateNaverMapUrl();
         },

         generateNaverMapUrl() {
             if (!this.route.start || !this.route.end) return;

             const start = `slat=${this.route.start.lat}&slng=${this.route.start.lng}&sname=${encodeURIComponent(this.route.start.name)}`;
             const end = `dlat=${this.route.end.lat}&dlng=${this.route.end.lng}&dname=${encodeURIComponent(this.route.end.name)}`;
             let waypoints = "";
			 if (this.route.waypoints.length > 0) {
		         waypoints = this.route.waypoints.map((w, index) => {
		             const waypointNum = index + 1; // v1부터 시작
		             return `&v${waypointNum}lat=${w.lat}&v${waypointNum}lng=${w.lng}&v${waypointNum}name=${encodeURIComponent(w.name)}`;
		         }).join("");
			 }

			 this.naverMapUrl = `nmap://route/car?${start}&${end}${waypoints}`;
			 window.open(this.naverMapUrl, '_blank');
         },

         calculateRoute() {
			
			if (navigator.geolocation) {
			    navigator.geolocation.getCurrentPosition(
			        (position) => {
			            const lat = position.coords.latitude;
			            const lng = position.coords.lnggitude;
			            this.currentLocation = { lat, lng };
			            this.errorMessage = "";
			            this.calculateRouteFromList(lat, lng, this.filteredResult);
			        },
			        (error) => {
			            switch(error.code) {
			                case error.PERMISSION_DENIED:
			                    this.errorMessage = "위치 정보 요청이 거부되었습니다.";
			                    break;
			                case error.POSITION_UNAVAILABLE:
			                    this.errorMessage = "위치 정보를 사용할 수 없습니다.";
			                    break;
			                case error.TIMEOUT:
			                    this.errorMessage = "요청이 시간 초과되었습니다.";
			                    break;
			                default:
			                    this.errorMessage = "알 수 없는 오류가 발생했습니다.";
			                    break;
			            }
			            this.currentLocation = null;
			            this.route = { start: null, waypoints: [], end: null };
			            this.naverMapUrl = "";
			        }
			    );
			} else {
			    this.errorMessage = "Geolocation이 브라우저에서 지원되지 않습니다.";
			}
			if(this.errMessage){
				notifySubmit('error', 'ERROR', this.errMessage, 'icon-caution');
			}
         },
		 filterLocations() {
			this.filteredResult = this.locations.filter(
				item => item.lat && item.lat.trim() !== '' && item.lng && item.lng.trim() !== ''
			);
			if(this.filteredResult.length < 2){
				notifySubmit('error', 'ERROR', '총 '+this.filteredResult.length+'건으로 출발지와 도착지를 선택하십시오', 'icon-caution');
				return;
			}
			if(this.filteredResult.length > 7){
				notifySubmit('error', 'ERROR', '총 '+this.filteredResult.length+'건으로 최대 경유지 수 "7개"를 초과되었습니다', 'icon-caution');
				return;
			}
			this.calculateRoute();

	     }
     }
 });
