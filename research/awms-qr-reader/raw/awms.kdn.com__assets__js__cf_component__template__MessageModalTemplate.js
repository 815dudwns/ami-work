/********************************************************************************************
 * @Writer
 *  박해수 2019.01.26 
 *  
 * @Description
 * 	모달 팝업 템플릿
 * 
 * @Syntax
 *  $.get('/assets/cf_component/template/MessageModalTemplate.html', function(response){
 *		$('head').append(response); 
 *	});
 * 	<modal-message :modalset="modalSet"></modal-message>
 * 
 * @Parameters
 *  modal : Modal => modal: new Modal(pSize, pCloseBtn, pType),
 *  type :  normal, blank, confirm, message 
 ********************************************************************************************/ 
 
Vue.component('modal-message', {
	props: ['modalset','callbackfunc'],
	template:`
		<transition name="fade">
			<div class="modal-layer-wrap common-modal" v-show="modalset.show" :class="{'on':modalset.show}" style="z-index:99999999;">
		    <div :id="modalset.id" class="modal-layer type02" style="display:block;" :class="{'modal-small':modalset.size='small', 'modal-middle':modalset.size='middle', 'modal-large':modalset.size='large'}">
		        <div class="modal-container">
		            <div class="modal-header">
		                    <p class="modal-title">{{modalset.title}}</p>
		                </div>
		                <div class="modal-content">
		                    <div class="row">
		                        <div class="col s12 message-popoup" v-html="modalset.message">
		                        
		                        </div>
		                    </div>
		                </div>
		                <div class="modal-footer center">
		                    <a href="#!" class="btn type02 size-m layer_close" @click="closeModal('confirm')" v-show="modalset.confirmBtn">확인</a>
		                    <a href="#!" class="btn type02 size-m layer_close" @click="closeModal('cancel')" v-show="modalset.cancelBtn">취소</a>
		                    <a href="#!" class="btn type02 size-m layer_close" @click="closeModal('close')" v-show="modalset.closeBtn">닫기</a>
		                </div>
		                <div class="btn-r">
		                    <a href="#!" class="cbtn" style="display: inline-block;" title="닫기" @click="closeModal('close')"><span class="icon-exit"></span></a>
		                </div>
		            </div>
		        </div>
		    </div>
		</transition>
	`,
	methods: {
		closeModal: function(gb) {
			this.modalset.closeModal(gb);
			this.$emit('messagepoppupcallback', gb, this.modalset.currentId, this.modalset.customData);
			return gb;
		}
	},
});
