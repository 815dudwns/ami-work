/********************************************************************************************
 * @Writer
 *  박해수 2019.02.19 
 *  
 * @Description
 * 	invalid-message 템플릿
 * 
 * @Syntax 
 * 	$.get('/assets/cf_component/template/InvalidTemplate.html', function(response){
 *		$('head').append(response); 
 *	});
 * 	<invalid-message :visible="dataset.rowposition == index" :name="'APP_ENM'" :error="error"/>
 * 
 * @Parameters
 *  visible : 보여지는 조건 
 *  name : validation 체크 이름
 *  verror : v-validate errors 오브젝트
 ********************************************************************************************/
Vue.component('invalid-message', {
	props: ['visible','name','verror'],
	template:`
		<small class="form-txt invalid" v-if="visible && verror.first(name)">{{ verror.first(name) }}</small>
	`
});
