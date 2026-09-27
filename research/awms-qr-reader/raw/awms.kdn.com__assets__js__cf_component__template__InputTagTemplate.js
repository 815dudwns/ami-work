/********************************************************************************************
 * @Writer
 *  박해수 2019.01.31 
 *  
 * @Description
 * 	input tag 템플릿
 * 
 * @Syntax 
 * 	$.get('/assets/cf_component/template/InputTagTemplate.html', function(response){
 *		$('head').append(response); 
 *	});
 * 	<input-tag :tagname="'tag'" :tags="item.TAG" :required="'required|max:2000'" :index="index"></input-tag>
 * 
 * @Parameters
 *  tagname : tag enm
 *  tagnamekor : tag kor name
 *  tags : tag Object
 *	required : vue-validation required (required|max:2000)
 *  index : loop item index
 ********************************************************************************************/
Vue.component('tag-input', {
	props: ['id','tagset','rowposition','modifiable','placeholder','validate','datavvas','invalidclass','width'],
	template:`
		<div class="tag-form-wrap">
			
			<div class="date-form-wrap col-tag-input" v-if="modifiable != false" :style="{'width': width ? width : '200px'}">
				<input type="text" :id="id" :ref="id" :name="id" class="size-m" :data-vv-as="datavvas" v-validate="validate" v-bind:class="{'invalid': errors.has(id) || invalidclass == 'invalid'}" @keyup.188="inputCommon" @keyup.13="inputChange" :placeholder="placeholder ? placeholder : '태그작성 후 엔터'"/>
				<a href="#!" class="right size-m" @click="inputChange" @keyup.13="inputChange"><span class="icon icon-enter"></span></a>
			</div>
			<div class="form-group row form-row" v-if="errors.has(id)">
				<invalid-message :visible="true" :name="id" :verror="errors"/>
			</div>
			<transition-group name="fade" class="col-tag-list">
    			<span v-for="(tag, index) in tagset.tagToList()" class="tag-type02" :key="index">{{tag}}<a v-if="modifiable != false" href="#!" class="on close icon-close" @click="tagset.removeTag(tag)"></a></span>
    		</transition-group>
		</div>
	`,
    //함수
    methods: {
    	inputChange: function(){
    		//$event.target.value, $event.target
    		if(this.$refs[this.id].value.indexOf(',') > -1){
    			this.loopCheck();
    		}else{
    			var validate = this.$validator.validateAll();
        	    var self = this;
        	    
        	    validate.then(function(response) {
        	        if(response){
        	        	self.tagset.insertTag(self.$refs[self.id].value.replaceAll(',',''), self.$refs[self.id]);
        	        }else{
        	        	notifySubmit('warning', '받는이 작성', self.errors.first(self.id), 'icon-caution');
        	        }
        	    });
    		}
    	},
    	loopCheck: function(){
    		var self = this;
    		var tags = self.$refs[self.id].value.split(',');
    		var notValidData = '';
    		
    		for(var i=0; i < tags.length ; i++){
    			var tagVal = tags[i];
        	    var self = this;
    	    
        	    if(isNull(self.validate) || self.validate.indexOf('email') == -1){
        	    	self.tagset.insertTag(tags[i], self.$refs[self.id]);
        	    }
        	    else if(!isNull(self.validate) && self.validate.indexOf('email') > -1 && self.validateEmail(tags[i])){
    	        	self.tagset.insertTag(tags[i], self.$refs[self.id]);
    	        }else{
    	        	notifySubmit('warning', '받는이 작성', self.errors.first(self.id), 'icon-caution');
    	        	if(notValidData == '') notValidData = tags[i];
    	        	else notValidData += ','+tags[i]; 
    	        }
    		}
    		if(notValidData == '') self.$validator.reset();
    		else self.$refs[self.id].value = notValidData; 
    		
    	},
    	validateEmail: function(mail) {
    		if (/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(mail)){
    			return true
      	  	}
      	    return false
    	}, 
    	inputCommon: function(){
    		var self = this;
    		
    		self.$refs[self.id].value = self.$refs[self.id].value.replaceAll(',','');
    		self.inputChange();
    	},
    	init: function(){
    		var self = this;
    		if(self.modifiable != false){
    			self.$refs[self.id].value = '';
        		self.$validator.reset();
    		}
    	},
    }
});
