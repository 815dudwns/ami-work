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
Vue.component('date-picker', {
	props: ['value','invalid','readonly','disabled'],
	template:`
		<div class="date-form-wrap date-picker-root" v-clickOutside="outSideClick">
			<a href="#!" class="size-m" @click="show = !show"><span class="icon icon-calendar"></span></a>
			<input type="text" class="size-m" :value="mask" @click="show = !show" v-bind:class="{'invalid': invalid, 'form-plaintxt': readonly == true}" :readonly="readonly == true ? true : false" :disabled="disabled == true ? true : false" @change="maskChange">
			<div class="date-picker" v-if="show && readonly != true && disabled != true">
			    <fieldset class="date-picker-fieldset">
			    	<div class="year-wrap">
						<a href="#!" class="icon-chevron-up" @click="addYear()"></a>
			    		<a href="#!" class="icon-chevron-down" @click="minusYear()"></a>
			    		<span class="year">{{year}}년</span>
			    		<span class="month">{{month}}월</span>
			    		<div class="month-control">
				    		<a href="#!" class="icon-chevron-left" @click="minusMonth()"></a>
							<a href="#!" class="icon-chevron-right" @click="addMonth()"></a>
							<a href="#!" class="goto-today" @click="getToday()">오늘</a>
						</div>
		    		</div>
			    	<div class="week-wrap">
			    		<label for="jan" class="week-picker-label weekend">일</label>
			    		<label for="jan" class="week-picker-label">월</label>
			    		<label for="jan" class="week-picker-label">화</label>
			    		<label for="jan" class="week-picker-label">수</label>
			    		<label for="jan" class="week-picker-label">목</label>
			    		<label for="jan" class="week-picker-label">금</label>
			    		<label for="jan" class="week-picker-label weekend">토</label>
			    	</div>
			    	<div class="date-wrap">
			    		<template v-for="(item, index) in dayList" v-if="dayList.length == 42">
			    			<input type="radio" :name="item" :value="item" :id="item" v-model="day" @change="updateDate('html-dayClick')" :checked="item == day">
				        	<label :for="item" class="date-picker-label" @click="dayClick(item)" :class="{'otherMonth': month != item.substring(4,6), 'weekend': isWeekend(item) && month == item.substring(4,6)}">{{parseInt(item.substring(6,8),10)}}</label>
			    		</template>
			        </div>
			    </fieldset>
			</div>
		</div>
	`,
	data: function(){
		return {
			show: false,
			today: moment(new Date()).format('YYYYMMDD'),
			year: moment(new Date()).format('YYYY'),
			month: moment(new Date()).format('MM'),
			day: moment(new Date()).format('YYYYMMDD'),
			dayList: [],
			mask: '',
			first: true,
		}
	},
	mounted: function(){
		this.modelToComp();
		
		if(this.dayList.length == 0){
			this.makeDay(this.year, this.month);
		}
		this.$validator.reset();
	},
    //데이터 감시
    watch: {
        'value': {
        	handler: function (val, oldVal) {
        		this.modelToComp();
        	}
        },
        'month': {
        	handler: function (val, oldVal) {
        		this.makeDay(this.year, val);
        	}
        },
        'year': {
        	handler: function (val, oldVal) {
        		this.makeDay(val, this.month);
        	}
        },
    },
    directives: {
    	clickOutside: {
    		bind: function (el, binding, vnode) {
    			try{
//    				console.log('clickOutside - bind');
    				el.clickOutsideEvent = function (event) {
        	        	if (!(el == event.target || el.contains(event.target))) {
        	        		vnode.context[binding.expression](event);
        	        	}
        	        };
        	      	document.body.addEventListener('click', el.clickOutsideEvent)
    			}catch(err){
    				console.log('clickOutside bind Error : '+err.message);
    				return false;
    			}
    	        
    	    },
    	    unbind: function (el) {
    	    	try{
//    	    		console.log('clickOutside - unbind');
    	    		document.body.removeEventListener('click', el.clickOutsideEvent)
    	    	}catch(err){
    				console.log('clickOutside unbind Error : '+err.message);
    				return false;
    			}
    	    },
	    }
	},
	methods: {
		modelToComp: function(){
			if(!isNull(this.value)){
				var dateValue = this.value.replaceAll('-','');
				
				if(dateValue.length > 0 && dateValue.length == 8){
					this.day = dateValue;
					this.setYear();
					this.setMonth();
					this.updateDate('modelToComp - true');
				}
			}else{
				this.day = '';
				this.year = moment(new Date()).format('YYYY');
				this.month = moment(new Date()).format('MM');
				this.updateDate('modelToComp - false');
				
				if(this.first){
					this.makeDay(this.year, this.month);
					this.first = !this.first;
				}
			}
		},
		outSideClick: function(pVal){
			this.show = false;
		},
		dayClick: function(pVal){
			//if(this.day == pVal){
			//	this.day = '';
			//}
			this.day = pVal;
			this.updateDate('dayClick');
			this.show = false;
		},
		updateDate: function(callMethod){
			try{
//				console.log('callMethod : '+callMethod);
				this.mask = this.day ? moment(this.day,'YYYYMMDD').format('YYYY-MM-DD') : '';
				this.$emit('input', this.day ? this.day : '');
			}catch(err){
				console.log('updateDate Error : '+err.message);
				return false;
			}
		},
		addMonth: function(){
			var tempDay = moment(this.year + this.month + '01', 'YYYYMMDD').add(1,'month').format('YYYYMMDD');
			this.year = moment(tempDay, 'YYYYMMDD').format('YYYY');
			this.month = moment(tempDay, 'YYYYMMDD').format('MM');
		},
		minusMonth: function(){
			var tempDay = moment(this.year + this.month + '01', 'YYYYMMDD').add(-1,'month').format('YYYYMMDD');
			this.year = moment(tempDay, 'YYYYMMDD').format('YYYY');
			this.month = moment(tempDay, 'YYYYMMDD').format('MM');
		},
		addYear: function(addYearVal){
			var addCnt = addYearVal;
			if(isNull(addCnt)) addCnt = 1;
			
			var tempDay = moment(this.year + this.month + '01', 'YYYYMMDD').add(addCnt,'years').format('YYYYMMDD');
			this.year = moment(tempDay, 'YYYYMMDD').format('YYYY');
		},
		minusYear: function(minusYearVal){
			var minusCnt = minusYearVal;
			if(isNull(minusCnt)) minusCnt = -1;
			
			var tempDay = moment(this.year + this.month + '01', 'YYYYMMDD').add(minusCnt,'years').format('YYYYMMDD');
			this.year = moment(tempDay, 'YYYYMMDD').format('YYYY');
		},
		setYear: function(){
			this.year = moment(this.day,'YYYYMMDD').format('YYYY')
		},
		setMonth: function(){
			this.month = moment(this.day,'YYYYMMDD').format('MM')
		},
		makeDay: function(pYear, pMonth){
			var defaultDay = pYear+pMonth+'01';
			var firstDayOfWeek = parseInt(moment(defaultDay,'YYYYMM').date(1).day(),10);
			var lastDay = moment(defaultDay,'YYYYMM').daysInMonth();
			var lastDayOfWeek = parseInt(moment(pYear+pMonth+lastDay,'YYYYMMDD').day(),10);
			var prevYearMonth = moment(defaultDay,'YYYYMM').add(-1, 'month').format('YYYYMM');
			var prevMonth = moment(prevYearMonth,'YYYYMM').format('MM');
			var prevMonthLastDay = moment(prevYearMonth,'YYYYMM').daysInMonth();
			var nextMontnFristDay = moment(defaultDay,'YYYYMM').add(1, 'month').date(1).format('YYYYMMDD');
			var leftCnt = 42;
			
//			console.log('firstDayOfWeek : '+firstDayOfWeek);
//			console.log('lastDay : '+lastDay);
//			console.log('lastDayOfWeek : '+lastDayOfWeek);
//			console.log('prevYearMonth : '+prevYearMonth);
//			console.log('prevMonth : '+prevMonth);
//			console.log('prevMonthLastDay : '+prevMonthLastDay);
//			console.log('nextMontnFristDay : '+nextMontnFristDay);
			
			this.dayList = [];
			for(var i=0 ; i < firstDayOfWeek ; i++){
				var currentDay = moment(prevYearMonth+prevMonthLastDay, 'YYYYMMDD').add(-firstDayOfWeek+i+1, 'days').format('YYYYMMDD');
				this.dayList.push(currentDay);
			}
			
			for(var i=0 ; i < lastDay ; i++){
				var currentDay = moment(defaultDay, 'YYYYMMDD').add(i, 'days').format('YYYYMMDD');
				this.dayList.push(currentDay);
			}
			
			leftCnt = leftCnt - this.dayList.length;
			for(var i=0 ; i < leftCnt ; i++){
				var currentDay = moment(nextMontnFristDay, 'YYYYMMDD').add(i, 'days').format('YYYYMMDD');
				this.dayList.push(currentDay);
			}			
//			console.log('total cnt : '+this.dayList.length);
//			console.log(JSON.stringify(this.dayList));
		},
		getToday: function(){
			var today = moment(new Date()).format('YYYYMMDD');
			this.day = today;
			this.year = moment(today,'YYYYMMDD').format('YYYY');
			this.month = moment(today, 'YYYYMMDD').format('MM');
			
			this.updateDate('getToday');
			this.makeDay(this.year, this.month);
		},
		isWeekend: function(pDayVal){
			var dayOfWeek = moment(pDayVal, 'YYYYMMDD').day();
			if(dayOfWeek == 0 || dayOfWeek == 6) return true;
			else false;
		},
		maskChange: function(event){
			var changeVal = event.target.value; 
			
			if(moment(changeVal, 'YYYYMMDD').isValid()){
				this.day = changeVal;
			}else{
				this.day = '';
			}
			
			this.updateDate('maskChange');
		},
	}
});
