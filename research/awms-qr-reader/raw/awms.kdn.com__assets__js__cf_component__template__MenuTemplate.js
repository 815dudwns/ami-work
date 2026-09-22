/********************************************************************************************
 * @Writer
 *  박해수 2019.02.11 
 *  
 * @Description
 * 	트리 템플릿, 트리 템플릿 사용시 데이터셋을 이용하지만 Dataset.setData() 시 두번째 파라메터(데이터셋 구분)에 'tree'를
 *  명시해야 한다. 그리고 트리는 기본적으로 CD, UP_CD, LV, ORD 컬럼이 존재해야 구성될 수 있다.
 * 
 * @Syntax
 *  $.get('/assets/cf_component/template/TreeTemplate.html', function(response){
 *		$('head').append(response); 
 *	});
 * 	<tree></tree>
 *  v-on:selectRow="selectRow" : 행을 선택할때의 이벤트를 받아올 수 있다 item, index를 반환한다.(index가 dataset의 index가 아닐 수 있음)
 * 
 * @Parameters
 ********************************************************************************************/
Vue.component('cf-menu', {
	props: ['model','open','first','firstopen'],
	methods: {
		toggle: function(index) {
			this.model[index].OPEN_YN = this.model[index].OPEN_YN == 'Y' ? 'N':'Y';
		},
		callback: function(item) {
			this.$emit('callback', item);
		},
		rowClick: function(item, index) {
			item.children ? this.toggle(index) : this.callback(item)
		},
	},
	template:`
		<ul :class="{'snb_list':first != false}" v-show="open">
			<li :class="{'on': item.children, 'noDepth':!item.children}" v-for="(item, index) in model">
				<a href="#!" @click="callback(item,index)">
					{{item.MENU_NM}}
				</a>
				<cf-menu :model="item.children" :open="open" :key="index" :first="false" v-if="item.children && item.OPEN_YN == 'Y'" v-on:callback="callback"></cf-menu>
		    </li>
		</ul>
	`
});
