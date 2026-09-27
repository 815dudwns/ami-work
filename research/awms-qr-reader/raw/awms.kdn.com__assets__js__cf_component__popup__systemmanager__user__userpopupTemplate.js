/********************************************************************************************
 * @Writer
 *  박해수 2019.02.09 
 *  
 * @Description
 * 	모달 사용자 검색 템플릿
 * 
 * @Syntax
 *  $.get('/app-assets/popup/template/userpopupTemplate.html', function(response){
 *		$('head').append(response); 
 *	});
 * 	<popup-user ref="popupuser"></popup-user>
 * 
 * @Parameters
 *  
 ********************************************************************************************/ 
 
Vue.component('popup-user', {
	props: ['type','id','lovcomp','usergroupgb','userstatusgb','searchargv','setting'],
	data: function () {
	    return {
	    	show: false,
	    	userList: new Dataset(),
	    	userListPaging: new PagingSet(5, 5),
	    	lovValue: '',
	    	pUserGroupGb: this.usergroupgb ? this.usergroupgb : '4',
	    	pUserStatusGb: this.userstatusgb ? this.userstatusgb : '1',
	    	pSearchArgv: this.searchargv ? this.searchargv : '',
		    pUserTypeGb: '',
		    pDeptCd: '',
		    pDeptNm: '',
			pAuthSearch: '',
		    detailSearch: false,
		    listLoading: {id:'listLoading', val:false},
		    firstMessage: true,
	    }
 	},
	template:`
		<div>
			<div class="btn-input" v-if="lovcomp">
				<a href="#!" class="btn type02 size-m center-icon" @click="showUserPopup()"><span class="icon-search"></span></a>
				<input type="text" class="size-m" v-on:keyup.13="showUserPopup();" v-model="lovValue">
			</div>
			<transition name="fade">
				<div class="modal-layer-wrap on" v-show="show">
			    <div :id="'template-popup-user-'+id" class="modal-layer modal-large" style="display:block;">
			        <div class="modal-container">
			            <div class="modal-header">
		                    <p class="modal-title">사용자 검색</p>
		                </div>
		                <div class="modal-content">
		                    <div class="row">
		                        <div class="col s12">
		                        	<div class="box-type03 col-inline">
										<label for="InputText02" class="label-type00 size-m icon-search">검색</label>
								        <select name="pUserGroupGb" class="size-m" id="pUserGroupGb" v-model="pUserGroupGb" data-vv-as="사용자 구분" v-validate="'required'" v-bind:class="{'invalid':errors.has('pUserGroupGb')}" @change="rmAuth">
							                <option v-for="(item, index) in smnCommcode.getCommcode('SMN', 'USER_GROUP_GB', 'select', 'CD_NM', 'N')" :value="item.CD">{{item.CD_NM}}</option>
							            </select>
							            <select name="pAuthSearch" class="size-m" id="pAuthSearch" v-model="pAuthSearch" data-vv-as="사용자 권한" v-if="pUserGroupGb == '4'">
											<option value="">- 전체 -</option>
											<option value="GE">일반회원</option>
											<option value="TF">기관장</option>
											<option value="TFM">기관마스터</option>
										</select>
								        <select name="pUserStatusGb" class="size-m" id="pUserStatusGb" v-model="pUserStatusGb">
							                <option v-for="(item, index) in _.filter(smnCommcode.getCommcode('SMN', 'USER_STATUS_GB', 'all', 'CD_NM', 'N', 'CD1'), function(e){return (e.CD1 == pUserGroupGb || e.CD1 == '' || e.CD1 == null);})" :value="item.CD">{{item.CD_NM}}</option>
							            </select>
							   			<input type="text" name="pSearchArgv" class="size-m" id="pSearchArgv" v-model="pSearchArgv" :placeholder="searchPlaceHolder('text')" @keyup.13="setUserList"  data-vv-as="사용자 명/아이디 " v-validate="searchPlaceHolder('validate')" v-bind:class="{'invalid':errors.has('pSearchArgv')}">
								        <input type="button" value="검색" class="btn type01 size-m" @click="setUserList">
								        <!--<div class="f-right">
								            <input type="button" value="상세검색" class="btn type01 size-m" @click="detailSearch = !detailSearch">
								        </div>-->
								    </div>
								    <!--<transition name=slidedown>
									    <div class="box-type03" v-if="detailSearch">
									        <div class="row form-row">
									            <div class="form-group col s12 l4">
									                <label for="pDeptCd" class="label-type01">{{changeText('부서','search')}}</label>
									                <input v-if="pUserGroupGb == '5' || pUserGroupGb == '9'" type="text" name="pDeptNm" class="size-m" id="pDeptNm" v-model="pDeptNm" :placeholder="changeText('부서','search')" @keyup.13="setUserList">
									                <select name="pDeptCd" class="size-m" id="pDeptCd" v-model="pDeptCd" v-if="pUserGroupGb != '5' && pUserGroupGb != '9'">
										                <option v-for="(item, index) in pUserGroupGb == '1'? deptCodeSet.getCustomcode('DEPT_CD', 'DEPT_NM', 'all'):hakgwaCodeSet.getCustomcode('DEPT_CD', 'DEPT_NM', 'all')" :value="item.CD">{{item.CD_NM}}</option>
										            </select>
									            </div>
									            <div class="form-group col s12 l4">
									                <label for="pUserTypeGb" class="label-type01">{{changeText('종류 구분','search')}}</label>
									                <input v-if="pUserGroupGb == '5' ||pUserGroupGb == '9'" class="size-m" type="text" placeholder="해당사항 없음" disabled>
									                <select name="pUserGroupGb" class="size-m" id="pUserTypeGb" v-model="pUserTypeGb" v-if="pUserGroupGb != '5' && pUserGroupGb != '9'">
										                <option v-for="(item, index) in pUserGroupGb == '1'? jikjongCodeSet.getCustomcode('JIKJONG_CD', 'JIKJONG_NM', 'all'):bouCommcode.getCommcode('BOU', 'HAKNYEON', 'all', 'CD_NM', 'N')" :value="item.CD">{{item.CD_NM}}</option>
										            </select>
									            </div>
									        </div>
									    </div>
								    </transition>-->
									<div class="col s12 l12">
									    <span class="board-info-txt size-m">총 <span>{{userListPaging.totalCnt}}</span>건의 사용자가 있습니다. (<span>{{userListPaging.getCurrentPage()}}</span> / {{userListPaging.getTotalPage()}})</span>
									</div>
				            		<div class="col s12 m12 xl12">
				            			<table class="table-type01 response" id="listLoading" summary="사용자 아이디, 사용자 명, 부서 코드, 권한 코드, 성별 구분, 생년월일, 사용 여부를 조회 항목별 순서대로 안내하는 표입니다">
				            				<caption>서비스 목록</caption>
				            				<colgroup>
				            					<col width="20%" /> <!-- 소속 -->
				            					<col width="10%" /> <!-- 아이디 -->
				            					<col width="10%" /> <!-- 성명 -->
				            					<col width="10%" /> <!-- 회원구분 -->
				            					<col width="10%" /> <!-- 기관장 -->
				            					<col width="10%" /> <!-- 기관마스터 -->
				            					<col width="10%" /> <!-- 상태 -->
				            				</colgroup>
				            				<thead>
				            					<tr>
				            						<th scope="col">소속(기관)명</th>
				            						<th scope="col">아이디</th>
				            						<th scope="col">성명</th>
				            						<th scope="col">회원구분</th>
				            						<th scope="col">기관장</th>
				            						<th scope="col">기관마스터</th>
				            						<th scope="col">상태</th>
				            					</tr>
				            				</thead>
				            				<tbody v-if="userList.getRowCount() > 0">		
				            					<tr v-for="(item, index) in userList.data" v-if="userList.getRowType(index) != 8" @dblclick="selectRow(item)" style="cursor:pointer;">
				            						<td data-header="소속(기관)명">{{item.DEPT_NM}}</td>
				            						<td data-header="아이디">{{item.USER_ID}}</td>
				            						<td data-header="성명">{{item.USER_NM}}</td>
				            						<td data-header="회원구분">{{item.DEFAULT_AUTH_NM}}</td>
				            						<td data-header="기관장"><a href="#!" :class="item.TF == 'T' ? 'btn-table-type02' : 'btn-table-type01'"><span :class="item.TF == 'T' ? 'icon-checkmark' : 'icon-minus-circle'"></span></a></td>
				            						<td data-header="기관마스터"><a href="#!" :class="item.TFM == 'T' ? 'btn-table-type02' : 'btn-table-type01'"><span :class="item.TFM == 'T' ? 'icon-checkmark' : 'icon-minus-circle'"></span></a></td>
				            						<td data-header="상태">{{item.USER_STATUS_GBNM}}</td>
				            					</tr>
				            				</tbody>
											<tbody v-else>
												<tr>
													<td data-header="검색결과 없음" colspan="100">검색결과가 없습니다.</td>
												</tr>
											</tbody>
				            			</table>
				            			<paging :pagingset="userListPaging" :type="'normal'"></paging>
				            		</div>
		                        </div>
		                    </div>
		                </div>
		                <div class="btn-r">
		                    <a href="#!" class="cbtn" style="display: inline-block;" title="닫기" @click="hideUserPopup()"><span class="icon-exit"></span></a>
		                </div>
		            </div>
		        </div>
			    </div>
			</transition>
		</div>
	`,
	//데이터 감시
	watch: {
		'userListPaging.currentPage': {
			handler: function (val, oldVal) {
				//this.setUserList()
				this.userList.pageChange(val, this.userListPaging.getRowCnt());
			}
	    },
	    'pUserGroupGb': {
	    	handler: function (val, oldVal) {
	    		/* 교원 */
	    		if(val == '1'){
	    			this.pUserStatusGb = '11';
	    		}
	    		/* 학생 */
	    		else if(val == '4'){
	    			this.pUserStatusGb = '1';
	    		}
	    		/* 기간계 외부사용자 */
	    		else if(val == '5'){
	    			this.pUserStatusGb = '91';
	    		}
	    		/* 외부사용자 */
				else if(val == '9'){
					this.pUserStatusGb = '81';
	    		}else{
	    			this.pUserStatusGb = '';
	    	
	    		}

	    	    this.pUserTypeGb = '';
	    	    this.pDeptCd = '';
	    	    this.pDeptNm = '';
	    		this.$validator.reset();
			}
	    },
	    'listLoading.val': {
	    	handler: function (val, oldVal) {
				this.LoadingOverlay($('#'+this.listLoading.id), val);
			}
	    },
	},
    //마운트 된 시점수행
    mounted: function(){
        //this.setUserList();
    },
    //함수
    methods: {
    	showUserPopup: function(){
    		var modalObj = $('#template-popup-user-'+this.id); //레이어의 id를 modalObj변수에 저장
    		if (modalObj.outerWidth() < $(document).width()) modalObj.css('margin-left', '-' + modalObj.outerWidth() / 2 + 'px');
    	    else modalObj.css('left', '0px');
    		//$("html").css("overflow", "hidden");
    		this.pSearchArgv = this.lovValue;
    		this.show = true;
    		this.firstMessage = true;
    		if(!isNull(this.pSearchArgv)) this.setUserList();
    	},
    	hideUserPopup: function(){
    		this.show = false;
    	},
    	selectRow: function(item){
    		if(this.setting){
    			this.lovValue = item[this.setting];
    		}
    		this.$emit('callback', item);
    		this.show = false;
    	},
        /* 사용자 리스트 조회 */
        setUserList: function(){
    		var validate = this.$validator.validateAll();
			var self = this;
			
			validate.then(function(response) {
				if(response && self.show){
					self.listLoading.val = true;
					var param = {
						pUserGroupGb: self.pUserGroupGb, 
						pUserStatusGb: self.pUserStatusGb, 
						pSearchArgv: self.pSearchArgv, 
						pUserTypeGb: self.pUserTypeGb,
						pDeptCd: self.pDeptCd,
						pDeptNm: self.pDeptNm,
//						pPageNo: self.userListPaging.currentPage, 
//						pRowCnt: self.userListPaging.getRowCnt(),
					}
					
					
					var returnVal = userApiApi.user(param, false);
					returnVal.then(function(response) {
						self.userList.setRawData(response.data, self.userListPaging.getRowCnt());
						if(response.data.length > 0){
							self.userListPaging.setTotalCnt(response.data.length);
						}else{
							self.userListPaging.setTotalCnt(0);
						}
					}).catch(function(error) {
						console.error('error:', error);
					}).finally(function(){
						self.listLoading.val = false;
						if(self.firstMessage){
							notifySubmit('info', '팝업검색', '선택하려는 대상을 더블클릭 해주세요', 'icon-message');
							self.firstMessage = false;
						}
					});
				}
			});
        },
        changeText: function(pText, pGb){
			var userGroupGb = '';
			
			if(pGb == 'search') userGroupGb = this.pUserGroupGb;
			else userGroupGb = this.userList.currentRow.USER_GROUP_GB;
			
			if(pText == '가입 일자'){
				if(userGroupGb == '1') return '입사일자';
				else if(userGroupGb == '4') return '입학 일자';
			}else if(pText == '내부 아이디'){
				if(userGroupGb == '1') return '사번';
				else if(userGroupGb == '4') return '학번';
			}else if(pText == '부서'){
				if(userGroupGb == '1') return '부서';
				else if(userGroupGb == '4') return '학과';
				else if(userGroupGb == '5' || userGroupGb == '9') return '소속';
			}else if(pText == '부서 코드'){
				if(userGroupGb == '1') return '부서 코드';
				else if(userGroupGb == '4') return '학과 코드';
				else if(userGroupGb == '5' || userGroupGb == '9') return '소속 코드';
			}else if(pText == '부서 명'){
				if(userGroupGb == '1') return '부서 명';
				else if(userGroupGb == '4') return '학과 명';
				else if(userGroupGb == '5' || userGroupGb == '9') return '소속 명';
			}else if(pText == '상태 구분'){
				if(userGroupGb == '1') return '재직 구분';
				else if(userGroupGb == '4') return '학적상태';
				else if(userGroupGb == '5' || userGroupGb == '9') return '사용 여부';
			}else if(pText == '종류 구분'){
				if(userGroupGb == '1') return '직종';
				else if(userGroupGb == '4') return '학년';
				else if(userGroupGb == '5' || userGroupGb == '9') return '해당 없음';
			}else if(pText == '등급 구분'){
				if(userGroupGb == '1') return '직급';
				else if(userGroupGb == '4') return '분반';
			}
			
			return pText;
		},
        searchPlaceHolder: function(pGb) {
	    	if(pGb == 'text'){
	    		if(this.pUserGroupGb == '4' && isNull(this.pDeptCd) && isNull(this.pUserTypeGb)){
		    		return '사용자 명/아이디(2자이상)';	
		    	}else{
		    		return '사용자 명/아이디';
		    	}
	    	}else if(pGb == 'validate'){
	    		if(this.pUserGroupGb == '4' && isNull(this.pDeptCd) && isNull(this.pUserTypeGb)){
		    		return 'required|min:2';	
		    	}else{
		    		return '';	
		    	}
	    	}
	    },
		rmAuth: function() {
			var self = this;

			self.pAuthSearch = '';
		}
    }
});
