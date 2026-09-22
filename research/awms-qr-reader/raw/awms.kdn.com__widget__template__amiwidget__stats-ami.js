/********************************************************************************************
 * @Writer
 *  박해수 2019.01.26 
 *  
 * @Description
 * 일반 게시판 리스트 위젯 (720px)
 * 
 * @Syntax 
 * 	$.get('/widget/template/amiwidget/stats-ami.js', function(response){
 *		$('head').append(response); 
 *	});
 * 	<component :is="'stats-ami'" :appid="appid" :widgetseq="widgetseq"></component>
 * 
 * @Parameters
 *  appid : 앱 아이디
 *  widgetseq : 위젯 번호
 ********************************************************************************************/ 
Vue.component('stats-ami', {
	props: ['appid','widgetseq','thumbnail','parameter'],
	data: function(){
		return {
			appInfo: [],
			widgetInfo: [],
			param: _.cloneDeep(this.parameter),		// 위젯 설정에서 넘겨주는 파라미터 
			mainListLoading: {id:'mainListLoading', val:false},
			widgetObsData: new Dataset(), //유지관리
			widgetCstData: new Dataset(), //공사관리
			widgetMtrData: new Dataset(), //계기관리
			widgetMtlData: new Dataset(), //자재관리
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
				console.log('normal-list : setAppInfo() Error : '+err.message);
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
				console.log('normal-list : setWidgetInfo() Error : '+err.message);
			};
		},
		widgetRefresh: function(){
			try{
				this.mainListLoading.val = true;
				if(!isNull(this.session.DEFAULT_AUTH_CD)){
					var self = this;
					var returnVal = amiwidgetApi.statPosts({'pUserAuthCd': this.session.DEFAULT_AUTH_CD, 'DEPT1': this.session.DEPT1}, true);
					
					returnVal.then(function(response) {
						self.widgetObsData.setData(response.data.obsStatList);
						self.widgetCstData.setData(response.data.cstStatList);
						self.widgetMtrData.setData(response.data.mtrStatList);
						self.widgetMtlData.setData(response.data.mtlStatList);
					}).catch(function(error) {
						console.error('error:', error);
					}).finally(function(){
						self.mainListLoading.val = false;
					});
				}else{
					this.mainListLoading.val = false;
				}
			} catch(err){
				console.log('normal-list : widgetRefresh() Error : '+err.message);
			};
		},
		appOpen: function(pPostNo, pBoardSeq, pBoardGb){
			var param = {
				'POST_NO' 	: pPostNo,
				'BOARD_SEQ' : pBoardSeq,
				'BOARD_GB' 	: pBoardGb
			};
			
			if(!isNull(this.param.APP_ID)) {
				parent.appOpen(this.param.APP_ID, this.param.MENU_CD, param);
			}else {
				parent.appOpen(this.appInfo.APP_ID, this.param.MENU_CD, param);
			}
		},
		moveApp: function(menuCd){
			if(!isNull(this.param.APP_ID)) {
				appOpen(this.param.APP_ID, menuCd);
			}else {
				appOpen(this.appInfo.APP_ID, menuCd);
			}
		},
	},
	template:`
		<article class="widget_box ami" v-if="thumbnail != true">
		    <header class="title_box">
		        <h2 class="widget_tit">AMI 현장관리 통계</h2> 
		    </header> 
		    <section class="content_box">
		        <div class="inner">
		            <div class="widget-type52">
		                <ul>
		                    <li>
		                        <span class="tit">유지<br> 관리</span>
		                        <ul class="number-list" v-for="(item, index) in widgetObsData.data" :key="index">
		                            <li>
		                                <span class="inner-tit">지시 건수</span>
		                                <span class="number">{{ item.ALL_CNT }}</span>
		                            </li>
		                            <li>
		                                <span class="inner-tit">임시저장 건수</span>
		                                <span class="number">{{ item.TEMP_SAVE_STEP }}</span>
		                            </li>
		                            <li>
		                                <span class="inner-tit">저장 건수</span>
		                                <span class="number">{{ item.SAVE_STEP }}</span>
		                            </li>
		                            <li>
		                                <span class="inner-tit">전송 건수</span>
		                                <span class="number">{{ item.SEND_STEP }}</span>
		                            </li>
		                        </ul>
		                    </li>
		                    <li>
		                        <span class="tit">공사<br> 관리</span>
		                        <ul class="number-list" v-for="(item, index) in widgetCstData.data" :key="index">
		                            <li>
		                                <span class="inner-tit">대상 건수</span>
		                                <span class="number">{{ item.ORDER_CNT }}</span>
		                            </li>
		                            <li>
		                                <span class="inner-tit">저장 건수</span>
		                                <span class="number">{{ item.SAVE_STEP }}</span>
		                            </li>
		                            <li>
		                                <span class="inner-tit">전송 건수</span>
		                                <span class="number">{{ item.SEND_STEP }}</span>
		                            </li>
		                        </ul>
		                    </li>
		                    <li>
		                        <span class="tit">계기<br> 관리</span>
		                         <ul class="number-list" v-for="(item, index) in widgetMtrData.data" :key="index">
		                            <li>
		                                <span class="inner-tit">지시 건수</span>
		                                <span class="number">{{ item.ALL_CNT }}</span>
		                            </li>
		                            <li>
		                                <span class="inner-tit">미조치 건수</span>
		                                <span class="number">{{ item.NO_ACTIV_STEP }}</span>
		                            </li>
		                            <li>
		                                <span class="inner-tit">임시저장 건수</span>
		                                <span class="number">{{ item.TEMP_SAVE_STEP }}</span>
		                            </li>
									<li>
									    <span class="inner-tit">저장 건수</span>
									    <span class="number">{{ item.SAVE_STEP }}</span>
									</li>
		                        </ul>
		                    </li>
		                    <li>
		                        <span class="tit">자재<br> 관리</span>
		                        <ul class="number-list" v-for="(item, index) in widgetMtlData.data" :key="index">
		                            <li>
		                                <span class="inner-tit">입고 건수</span>
		                                <span class="number">{{ item.WRHSG_CNT }}</span>
		                            </li>
		                            <li>
		                                <span class="inner-tit">출고 건수</span>
		                                <span class="number">{{ item.SHP_CNT }}</span>
		                            </li>
		                            <li>
		                                <span class="inner-tit">환입 건수</span>
		                                <span class="number">{{ item.PCRTN_CNT }}</span>
		                            </li>
									<li>
									    <span class="inner-tit">인계 건수</span>
									    <span class="number">{{ item.HDOV_CNT }}</span>
									</li>
									<li>
									    <span class="inner-tit">설치 건수</span>
									    <span class="number">{{ item.USE_CNT }}</span>
									</li>
		                        </ul>
		                    </li>
		                </ul>
		                <div class="btn-line center">
		                    <a href="#!" class="btn type01 size-m left-icon icon-rotate-ccw" @click="widgetRefresh">새로고침</a>
		                </div>
		            </div>
		        </div>
		    </section>
		</article>
		<article class="widget_box ami" v-else-if="thumbnail == true">
		    <header class="title_box">
		        <h2 class="widget_tit">AMI 현장관리 통계</h2> 
		    </header> 
		    <section class="content_box">
		        <div class="inner">
		            <div class="widget-type52">
		                <ul>
		                    <li>
		                        <span class="tit">유지<br> 관리</span>
		                        <ul class="number-list">
		                            <li>
		                                <span class="inner-tit">지시 건수</span>
		                                <span class="number">368</span>
		                            </li>
		                            <li>
		                                <span class="inner-tit">저장 건수</span>
		                                <span class="number">168</span>
		                            </li>
		                            <li>
		                                <span class="inner-tit">완료 건수</span>
		                                <span class="number">1268</span>
		                            </li>
		                        </ul>
		                    </li>
		                    <li>
		                        <span class="tit">공사<br> 관리</span>
		                        <ul class="number-list">
		                            <li>
		                                <span class="inner-tit">지시 건수</span>
		                                <span class="number">14</span>
		                            </li>
		                            <li>
		                                <span class="inner-tit">저장 건수</span>
		                                <span class="number">3</span>
		                            </li>
		                            <li>
		                                <span class="inner-tit">완료 건수</span>
		                                <span class="number">5</span>
		                            </li>
		                        </ul>
		                    </li>
		                    <li>
		                        <span class="tit">계기<br> 관리</span>
		                        <ul class="number-list">
		                            <li>
		                                <span class="inner-tit">지시 건수</span>
		                                <span class="number">368</span>
		                            </li>
		                            <li>
		                                <span class="inner-tit">저장 건수</span>
		                                <span class="number">168</span>
		                            </li>
		                            <li>
		                                <span class="inner-tit">완료 건수</span>
		                                <span class="number">1268</span>
		                            </li>
		                        </ul>
		                    </li>
		                    <li>
		                    <span class="tit">자재<br> 관리</span>
		                        <ul class="number-list">
		                            <li>
		                                <span class="inner-tit">지시 건수</span>
		                                <span class="number">14</span>
		                            </li>
		                        <li>
		                            <span class="inner-tit">저장 건수</span>
		                            <span class="number">3</span>
		                        </li>
		                        <li>
		                            <span class="inner-tit">완료 건수</span>
		                            <span class="number">5</span>
		                        </li>
		                        </ul>
		                    </li>
		                </ul>
		                <div class="btn-line center">
		                    <a href="#!" class="btn type01 size-m left-icon icon-rotate-ccw">새로고침</a>
		                </div>
		            </div>
		        </div>
		    </section>
		</article>
	`
});
