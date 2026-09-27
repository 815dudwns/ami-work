/********************************************************************************************
 * @Writer
 *  박해수 2019.02.30
 *
 * @Description
 * 	TimePicker 시, 분 초를 선택하는 템플릿
 *
 * @Syntax
 *  $.get('/assets/cf_component/template/TimePickerTemplate.html', function(response){
 *		$('head').append(response); 
 *	});
 * 	<time-picker></time-picker>
 *
 * @Parameters
 ********************************************************************************************/
Vue.component('time-picker', {
	props: ['value', 'invalid', 'readonly', 'disabled', 'dttm'],
	data: function () {
		return {
			hh: null,
			mm: null,
			mask: null,
		}
	},
	mounted: function () {
		var vm = this;
		this.modelToComp();

		$(this.$refs.inpuTime).clockpicker({
			placement: 'bottom',
			align: 'left',
			autoclose: true,
			'default': 'now',
			donetext: '확인',
			init: function () { /* console.log("colorpicker initiated"); */
			},
			beforeShow: function () { /* console.log("before show"); */
			},
			afterShow: function () { /* console.log("after show"); */
			},
			beforeHide: function () { /* console.log("before hide"); */
			},
			afterHide: function () { /* console.log("after hide"); */
			},
			beforeHourSelect: function () { /* console.log("before hour selected"); */
			},
			afterHourSelect: function () { /* console.log("after hour selected"); */
			},
			beforeDone: function () { /* console.log("before done"); */
			},
			afterDone: function () {
				/* console.log("after done");  */
				vm.compToModel();
			}
		});

		$(this.$refs.mModify).click(function (e) {
			// Have to stop propagation here
			e.stopPropagation();
			$(this).find('+ input').click();
		});
	},
	//데이터 감시
	watch: {
		'value': {
			handler: function (val, oldVal) {
				this.modelToComp();
			}
		},
	},
	methods: {
		modelToComp: function (pGb) {
			var porpsVal = isNull(this.value) ? this.value : this.value.replaceAll(':', '');
			var compVal = isNull(this.mask) ? this.mask : this.mask.replaceAll(':', '');

			if (porpsVal != compVal) {
				if (this.value.length == 4) {
					this.mask = this.value.substring(0, 2) + ':' + this.value.substring(2, 4);
				} else {
					this.mask = this.value;
				}

				if (pGb == 'focusOut') {
					this.value = this.mask;
				}
			}
		},
		compToModel: function () {
			this.$emit('input', this.$refs.inpuTime.value.replaceAll(':', ''));
		}
	},
	template: `
		<div class="date-form-wrap">
			<template v-if="readonly != true && disabled != true">
				<a href="#!" class="size-m" ref="mModify"><span class="icon icon-realtime"></span></a>
				<input class="form-control size-m" ref="inpuTime" v-model="mask" v-bind:class="{'invalid': invalid}" v-mask="'##:##'" @input="$emit('update:dttm', $event.target.value)">
			</template>
			<template v-else-if="readonly == true && disabled != true">
				<a href="#!" class="size-m" ref="mModify"><span class="icon icon-realtime"></span></a>
				<input class="form-control size-m" ref="inpuTime" v-model="mask" v-bind:class="{'invalid': invalid}" v-mask="'##:##'" @input="$emit('update:dttm', $event.target.value)" :readonly="readonly == true ? true : false">
			</template>
			<template v-else-if="disabled == true">
				<a href="#!" class="size-m"><span class="icon icon-realtime"></span></a>
				<input class="form-control size-m" v-model="mask" v-bind:class="{'invalid': invalid, 'form-plaintxt': readonly == true}" v-mask="'##:##'" :disabled="disabled == true ? true : false">
			</template>
		</div>
	`
});
