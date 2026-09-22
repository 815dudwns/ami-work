/********************************************************************************************
 * @Writer
 *  박해수 2019.02.30
 *  
 * @Description
 * 	MonthPicker 년도, 월을 선택하는 템플릿
 * 
 * @Syntax
 *  $.get('/assets/cf_component/template/MonthPickerTemplate.html', function(response){
 *		$('head').append(response); 
 *	});
 * 	<month-picker></month-picker>
 * 
 * @Parameters
 ********************************************************************************************/
Vue.component('month-picker', {
	props: ['value','invalid','readonly','disabled'],
	template:`
		<div class="date-form-wrap" v-clickOutside="outSideClick">
			<a href="#!" class="size-m" @click="show = !show"><span class="icon icon-calendar"></span></a>
			<input type="text" class="size-m" :value="mask" @click="show = !show" v-bind:class="{'invalid': invalid, 'form-plaintxt': readonly == true}" :readonly="readonly == true ? true : false" :disabled="disabled == true ? true : false" @change="maskChange">
			<div class="month-picker" v-if="show && readonly != true && disabled != true">
			    <fieldset class="month-picker-fieldset">
			    	<div class="year-wrap"><a href="#!" class="icon-chevron-left" @click="minusYear()"></a><span class="year">{{year}}년</span><a href="#!" class="icon-chevron-right" @click="addYear()"></a></div>
			    	<div class="month-wrap">
				        <input type="radio" name="month" value="01" id="jan" v-model="month" @change="updateDate()">
				        <label for="jan" class="month-picker-label" @click="monthClick('01')">1월</label>
				        <input type="radio" name="month" value="02" id="feb" v-model="month" @change="updateDate()">
				        <label for="feb" class="month-picker-label" @click="monthClick('02')">2월</label>
				        <input type="radio" name="month" value="03" id="mar" v-model="month" @change="updateDate()">
				        <label for="mar" class="month-picker-label" @click="monthClick('03')">3월</label>
				        <input type="radio" name="month" value="04" id="apr" v-model="month" @change="updateDate()">
				        <label for="apr" class="month-picker-label" @click="monthClick('04')">4월</label>
				        <input type="radio" name="month" value="05" id="may" v-model="month" @change="updateDate()">
				        <label for="may" class="month-picker-label" @click="monthClick('05')">5월</label>
				        <input type="radio" name="month" value="06" id="jun" v-model="month" @change="updateDate()">
				        <label for="jun" class="month-picker-label" @click="monthClick('06')">6월</label>
				        <input type="radio" name="month" value="07" id="jul" v-model="month" @change="updateDate()">
				        <label for="jul" class="month-picker-label" @click="monthClick('07')">7월</label>
				        <input type="radio" name="month" value="08" id="aug" v-model="month" @change="updateDate()">
				        <label for="aug" class="month-picker-label" @click="monthClick('08')">8월</label>
				        <input type="radio" name="month" value="09" id="sep" v-model="month" @change="updateDate()">
				        <label for="sep" class="month-picker-label" @click="monthClick('09')">9월</label>
				        <input type="radio" name="month" value="10" id="oct" v-model="month" @change="updateDate()">
				        <label for="oct" class="month-picker-label" @click="monthClick('10')">10월</label>
				        <input type="radio" name="month" value="11" id="nov" v-model="month" @change="updateDate()">
				        <label for="nov" class="month-picker-label" @click="monthClick('11')">11월</label>
				        <input type="radio" name="month" value="12" id="dec" v-model="month" @change="updateDate()">
				        <label for="dec" class="month-picker-label" @click="monthClick('12')">12월</label>
			        </div>
			    </fieldset>
			</div>
		</div>
	`,
	data: function(){
		return {
			show: false,
			year: moment(new Date(), 'YYYY').format('YYYY'), 
			month: '',
			day: moment(new Date()).format('YYYYMM'),
			mask: '',
		}
	},
    //데이터 감시
    watch: {
        'value': {
        	handler: function (val, oldVal) {
        		this.modelToComp();
        	}
        }
    },
    directives: {
    	clickOutside: {
    		bind: function (el, binding, vnode) {
    	        el.clickOutsideEvent = function (event) {
    	        	if (!(el == event.target || el.contains(event.target))) {
    	        		vnode.context[binding.expression](event);
    	        	}
    	        };
    	      	document.body.addEventListener('click', el.clickOutsideEvent)
    	    },
    	    unbind: function (el) {
    	    	document.body.removeEventListener('click', el.clickOutsideEvent)
    	    },
	    }
	},
	mounted: function(){
		this.modelToComp();
		this.$validator.reset();
	},
	methods: {
		modelToComp: function(){
			if(!isNull(this.value) && this.value != ''){
				var dateValue = this.value.replaceAll('-','');
				
				if(dateValue.length > 0 && dateValue.length == 6){
					this.year = dateValue.substring(0,4);
					this.month = dateValue.substring(4,6);
					this.updateDate();
				}
			}else{
				this.month = '';
				this.updateDate();
			}
		},
		monthClick: function(pVal){
			this.updateDate();
			this.show = false;
		},
		outSideClick: function(pVal){
			this.show = false;
		},
		updateDate: function(){
			this.mask = this.month ? this.year+'-'+this.month : '';
			this.$emit('input', this.month ? this.year+this.month : '')
		},
		addYear: function(){
			this.year++; 
			this.updateDate();
		},
		minusYear: function(){
			this.year--;
			this.updateDate();
		},
		maskChange: function(event){
			var changeVal = event.target.value; 
			if(!moment(changeVal, 'YYYYMM').isValid()){
				this.month = '';
				this.updateDate();
			}
		},
	}
});
