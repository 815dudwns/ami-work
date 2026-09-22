/********************************************************************************************
 * @Writer
 *   
 *  
 * @Description
 * 일반 게시판 리스트 위젯 (720px)
 * 
 * @Syntax 
 * 	$.get('/widget/template/community/notice-ami.js', function(response){
 *		$('head').append(response); 
 *	});
 * 	<component :is="'notice-ami'" :appid="appid" :widgetseq="widgetseq"></component>
 * 
 * @Parameters
 *  appid : 앱 아이디
 *  widgetseq : 위젯 번호
 ********************************************************************************************/ 
Vue.component('notice-ami', {
	props: ['appid','widgetseq','thumbnail','parameter'],
	data: function(){
		return {
			appInfo: [],
			widgetInfo: [],
			param: _.cloneDeep(this.parameter),		// 위젯 설정에서 넘겨주는 파라미터 
			mainListLoading: {id:'mainListLoading', val:false},
			widgetData: new Dataset(),
			popupData: new Dataset(),
		}
	},
    //데이터 감시
    watch: {
    	'mainListLoading.val': {
	    	handler: function (val, oldVal) {
				this.LoadingOverlay($(this.$refs[this.mainListLoading.id]), val);
			}
	    },
    },
	filters: {
		  capitalize: function (value) {
		    if (!value) return ''
		    value = value.toString()
		    return value.substr(0,4)+'. '+value.substr(4,2)+'. '+value.substr(6,2)
		  }
	},
	mounted: function(){
		//앱에서 사용할 전역 변수에 넘겨받은 정보 입력
		if(!isNull(this.param)){
			this.param = typeof this.param == 'string' ? eval("("+this.param+")") : this.param;
		}else{
			this.param = {};
		}

		// console.log(this.param);
		
		if(this.thumbnail != true){
			this.setAppInfo();
			this.setWidgetInfo();
			this.widgetRefresh();
		}
    },
	methods: {
		setAppInfo: function(){
			try{
				var self = this;
				var returnVal = appApi.appId(self.appid, false);
				
				returnVal.then(function(response) {
					self.appInfo = response.data;
				}).catch(function(error) {
					console.error('error:', error);
				}).finally(function(){
					
				});
			} catch(err){
				console.log('notice-ami : setAppInfo() Error : '+err.message);
			};
		},
		setWidgetInfo: function(){
			try{
				var self = this;
				var returnVal = widgetApi.widgetId(self.appid, self.widgetseq, false);
				
				returnVal.then(function(response) {
					self.widgetInfo = response.data;
				}).catch(function(error) {
					console.error('error:', error);
				}).finally(function(){
					
				});
			} catch(err){
				console.log('notice-ami : setWidgetInfo() Error : '+err.message);
			};
		},
		widgetRefresh: function(){
			try{
				this.mainListLoading.val = true;
				var self = this;
				var returnVal = amiwidgetApi.noticePost({'pBoardGb': '02', 'pBoardSeq': '1', 'pSearchCount': 4}, true);
				returnVal.then(function(response) {
					self.widgetData.setData(response.data.list);
					self.popupData.setData(response.data.popup);
					self.fnShowModal();
					// console.log(self.widgetData);
				}).catch(function(error) {
					console.error('error:', error);
				}).finally(function(){
					self.mainListLoading.val = false;
				});
			} catch(err){
				console.log('notice-ami : widgetRefresh() Error : '+err.message);
			};
		},
		appOpen: function(pPostNo, pBoardSeq){
			var url = '';
			
			if(pBoardSeq=='1'){//컨퍼런스
				url += '/html/main/index.html?';
				url += 'app='+this.appInfo.APP_ID+'&'
				url += 'menu='+this.param.MENU_CD+'&'
				url += 'postNo='+pPostNo
			}
			window.open(url);
		},
		moveApp: function(menuCd){
			if(!isNull(this.param.APP_ID)) {
				appOpen(this.param.APP_ID, menuCd);
			}else {
				appOpen(this.appInfo.APP_ID, menuCd);
			}
		},
		
		fnShowModal: function(){
			if (this.isTodayClosed()) return; //오늘그만보기 시 팝업 호출x
			const noticeDate = new Date(this.popupData.data[0].UPDATE_DTTM);
			const daysAgo = new Date(new Date().setDate(new Date().getDate() - 7));
			
			if(daysAgo <= noticeDate){
				const noticeTitle = this.popupData.data[0].TITLE;
				//리플레이스하는 이유는 특수문자, html태그 관련하여 처리하기 위함 
				const noticeContent = this.fnDecContents(this.popupData.data[0].CONTENTS.replace(/\[/g, '&#91;').replace(/\]/g, '&#93;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/(<([^>]+)>)/ig,"").replace(/[&]nbsp[;]/gi,''));
				showNoticeModal(noticeTitle, noticeContent); //index.html의 showNoticeModal메소드 호출	
			}
		},
		// HTML Entity 디코딩
		fnDecContents: function(contents){
			const textarea = document.createElement('textarea');
			textarea.innerHTML = contents;
			return textarea.value.replace(/\\([\\`"'{}[\]()_*|<>.?+=~!@#$%^&,-])/g, '$1').replace(/\[/g, '&#91;').replace(/\]/g, '&#93;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/(<([^>]+)>)/ig,"").replace(/[&]nbsp[;]/gi,'');
		},
		//오늘그만보기 체크
		isTodayClosed: function(){
			const closeDate = localStorage.getItem("noticeCloseDate");
			const today = new Date().toISOString().slice(0, 10);
			return closeDate === today;
		},
	},
	template:`
		<article class="widget_box ami" v-if="thumbnail != true">
		    <header class="title_box">
		        <h2 class="widget_tit">공지사항</h2> 
		    </header> 
		    <section class="content_box">
		        <div class="inner">
		            <div class="widget-type53" v-if="widgetData.getRowCount() > 0">
		                <ul>
		                    <li v-for="(item, index) in widgetData.data">
								<a href="#!" @click="appOpen(item.POST_NO,item.BOARD_SEQ)">
		                            <span class="date-box"><span class="big">{{item.INSERT_DT.substring(11,12)}}</span>{{item.INSERT_DT.substring(0,8)}}</span>
		                            <div class="cont-box">
		                                <p class="tit">{{item.TITLE}}</p>
		                                <p class="txt">{{fnDecContents(item.CONTENTS)}}</p>
		                                <span class="etc icon-eye">{{item.SEARCH_CNT}}</span><span class="etc icon-realtime">{{item.INSERT_DT}}</span><span class="writer">{{item.JAKSEONGJA_NM}}</span>
		                            </div>
								</a>
		                    </li>
		                </ul>
		                <div class="btn-line center">
		                    <a href="#!" class="btn type02 size-s" @click="moveApp(param.MENU_CD)">커뮤니티 보기</a>
		                </div>
		            </div>
		            <div class="widget-type21" v-else>
		                <div class="no-cont">현재 등록된 게시물이 없습니다.</div> 
		            </div>
		        </div>
		    </section>
		</article>
		<article class="widget_box ami" ref="mainListLoading" v-else-if="thumbnail == true">
			<header class="title_box">
			    <h2 class="widget_tit">공지사항</h2> 
			</header> 
			<section class="content_box">
			    <div class="inner">
			        <div class="widget-type53">
			            <ul>
			                <li><a href="#!">
			                    <span class="date-box"><span class="big">18</span>2025. 02</span>
			                    <div class="cont-box">
			                        <p class="tit">기술자문위원회 심의위원 공모</p>
			                        <p class="txt">모집분야 : 건축설계, 건설사업관리, 건축시공, 건설안전	모집인원 : 최대 20명  -자격요건 : 아래의 조건 중 하나</p>
			                        <span class="etc icon-eye">687</span><span class="etc icon-realtime">2025. 02. 18</span><span class="writer">관리자</span>
			                    </div></a>
			                </li>
			                <li><a href="#!">
			                    <span class="date-box"><span class="big">12</span>2025. 02</span>
			                    <div class="cont-box">
			                        <p class="tit">스마트미터링 Week 개최 </p>
			                        <p class="txt">한전은 11월 19일에서 21일까지 서울 용산 전쟁기념관 내 로얄파크컨벤션에서 AMI 보급사업의 완료를 기념하고</p>
			                        <span class="etc icon-eye">687</span><span class="etc icon-realtime">2025. 02. 18</span><span class="writer">관리자</span>
			                    </div></a>
			                </li>
			                <li><a href="#!">
			                    <span class="date-box"><span class="big">6</span>2025. 02</span>
			                    <div class="cont-box">
			                        <p class="tit">비상임이사 모집 공고</p>
			                        <p class="txt">친환경, 디지털 중심의 에너지 ICT 플랫폼 전문 기업 한전 KDN(주)의 비상임이사를 모십니다.</p>
			                        <span class="etc icon-eye">687</span><span class="etc icon-realtime">2025. 02. 18</span><span class="writer">관리자</span>
			                    </div></a>
			                </li>
			                <li><a href="#!">
			                    <span class="date-box"><span class="big">21</span>2025. 01</span>
			                    <div class="cont-box">
			                        <p class="tit">한전KDN 국민소통 참여단 모집(연장)</p>
			                        <p class="txt">한전은 11월 19일에서 21일까지 서울 용산 전쟁기념관 내 로얄파크컨벤션에서 AMI 보급사업의 완료를 기념하고</p>
			                        <span class="etc icon-eye">687</span><span class="etc icon-realtime">2025. 02. 18</span><span class="writer">관리자</span>
			                    </div></a>
			                </li>
			            </ul>
			            <div class="btn-line center">
			                <a href="#!" class="btn type02 size-s">커뮤니티 보기</a>
			            </div>
			        </div>
			    </div>
			</section>
		</article>
	`
});
