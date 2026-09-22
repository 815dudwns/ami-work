/********************************************************************************************
 * @Writer
 *  박해수 2019.01.26 
 *  
 * @Description
 * 배너 AMI현장관리 위젯 (720px)
 * 
 * @Syntax 
 * 	$.get('/widget/template/amiwidget/manage-ami.js', function(response){
 *		$('head').append(response); 
 *	});
 * 	<component :is="'manage-ami'" :appid="appid" :widgetseq="widgetseq"></component>
 * 
 * @Parameters
 *  appid : 앱 아이디
 *  widgetseq : 위젯 번호
 ********************************************************************************************/ 
Vue.component('manage-ami', {
	props: ['appid','widgetseq','thumbnail','parameter'],
	data: function(){
		return {
			appInfo: [],
			widgetInfo: [],
			param: _.cloneDeep(this.parameter),		// 위젯 설정에서 넘겨주는 파라미터 
			mainListLoading: {id:'mainListLoading', val:false},
			widgetData: new Dataset()
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
					var returnVal = amiwidgetApi.appListPosts({'pUserAuthCd': this.session.DEFAULT_AUTH_CD}, false);
					
					returnVal.then(function(response) {
						self.widgetData.setData(response.data);
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
		moveApp: function(appId, menuCd){
			appOpen(appId, menuCd);
		},
		getImage: function(menuCd){
			switch (menuCd) {
				case 'MOBOBS' :
					return '/widget/images/ami_widget51_icon01.png'
				case 'MOBCST' : 
					return '/widget/images/ami_widget51_icon02.png'
				case 'MOBMTR' : 
					return '/widget/images/ami_widget51_icon03.png'
				case 'MOBMTL' : 
					return '/widget/images/ami_widget51_icon04.png'
				case 'MOBRNL' : 
					return '/widget/images/ami_widget51_icon05.png'
				case 'MOBEMR' :
					return '/images/ami/main_ico0501.png'
				default : 
					return '/widget/images/ami_widget51_icon06.png'
			}
		}
	},
	template:`		
		<article class="widget_box ami ami51" v-if="thumbnail != true">
		    <header class="title_box">
		        <h2 class="widget_tit">AMI 현장관리</h2>
		    </header>
		    <section class="content_box">
		        <div class="inner">
		            <div class="widget-type51" v-if="widgetData.getRowCount() > 0">
		                <ul>
		                    <li v-for="(item, index) in widgetData.data" :key="index">
		                        <a href="javascript:void(0)" @click="moveApp(item.APP_ID, item.MENU_CD)">
		                            <span class="icon"><img :src="getImage(item.APP_ID)"></span>
		                            <span class="tit">{{ item.APP_NM }}</span>
		                        </a>
		                    </li>
		                </ul>
		            </div>
					<div class="widget-type21" v-else>
					    <div class="no-cont">현재 부여된 권한이 없습니다. </br>관리자에게 문의해주세요.</div> 
					</div>
		        </div>
		    </section>
		</article>
		<article class="widget_box ami ami51" v-else-if="thumbnail == true">
		    <header class="title_box">
		        <h2 class="widget_tit">AMI 현장관리</h2>
		    </header>
		    <section class="content_box">
		        <div class="inner">
		            <div class="widget-type51">
		                <ul>
		                    <li>
		                        <a href="javascript:void(0)">
		                            <span class="icon"><img src="/widget/images/ami_widget51_icon01.png"></span>
		                            <span class="tit">유지관리</span>
		                        </a>
		                    </li>
		                    <li>
		                        <a href="javascript:void(0)">
		                            <span class="icon"><img src="/widget/images/ami_widget51_icon02.png"></span>
		                            <span class="tit">AMI 공사 관리</span>
		                        </a>
		                    </li>
		                    <li>
		                        <a href="javascript:void(0)">
		                            <span class="icon"><img src="/widget/images/ami_widget51_icon03.png"></span>
		                            <span class="tit">계기 관리</span>
		                        </a>
		                    </li>
		                    <li>
		                        <a href="javascript:void(0)">
		                            <span class="icon"><img src="/widget/images/ami_widget51_icon04.png"></span>
		                            <span class="tit">자재 관리</span>
		                        </a>
		                    </li>
		                    <li>
		                        <a href="javascript:void(0)">
		                            <span class="icon"><img src="/widget/images/ami_widget51_icon05.png"></span>
		                            <span class="tit">지도 확인</span>
		                        </a>
		                    </li>
		                    <li>
		                        <a href="javascript:void(0)">
		                            <span class="icon"><img src="/widget/images/ami_widget51_icon06.png"></span>
		                            <span class="tit">현장 관리(콘솔)</span>
		                        </a>
		                    </li>
		                </ul>
		            </div>
		        </div>
		    </section>
		</article>
	`
});
