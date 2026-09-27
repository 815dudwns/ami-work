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
Vue.component('tree', {
	props: ['model','open'],
	methods: {
		toggle: function(index) {
			this.model[index].OPEN = !this.model[index].OPEN;
		},
		selectRow: function(item, index) {
			console.log(JSON.stringify(item));
		}
	},
	template:`
		<ul v-show="open" :name="open">
			<li v-for="(item, index) in model" >
				<span @click="selectRow(item, index)">{{item.CD}}</span>
				<span v-if="item.children" @click="toggle(index)">[{{ item.OPEN ? '-' : '+'}}]</span>
				<tree :model="item.children" :open="item.OPEN" :key="index"></tree>
			</li>
		</ul>
	`
});
