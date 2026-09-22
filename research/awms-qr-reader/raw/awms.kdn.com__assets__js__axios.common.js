axios.defaults.timeout = 600000;
axios.defaults.baseURL = window.location.origin;
axios.defaults.headers['Cache-Control'] = "no-cache,no-store,must-revalidate,max-age=-1,private";
axios.defaults.validateStatus = function (status) {
    return true;
};

axios.interceptors.request.use(function (config) {
	try{
		var defaultInfo = '';
		
		if(typeof globalDefaultInfo == 'object'){
			if(self == top) defaultInfo = globalDefaultInfo;
			else defaultInfo = parent.globalDefaultInfo;
		}
		
		if(config.loading){
			document.body.classList.add('loading-indicator');
		}
		
		return config;
	}catch(err){
		console.log('axios.interceptors.request Error : '+err.message);
		return false;
	}
}, function (error) {
	return Promise.reject(error);
});

axios.interceptors.response.use(function (response) {
	try{
		var status = response.data.status;

		if(response.config.loading){
			document.body.classList.remove('loading-indicator');
		}
		
		//에러처리
		if(typeof status == 'string') {
			var date = new Date(response.data.timestamp);
			var error = response.data.error;
			var message = response.data.message;
			var returnVal = '['+status+'] '+date+' : ('+error+') ';
			
			//특정 메시지 들은 캐치하여 내부정보가 보이지 않는 error로 치환하여 반환한다.
			if(message.indexOf('PRIMARY KEY') > -1){
				message = 'E0001';
			}
			else if(message.indexOf('.jdbc.') > -1){
				message = 'E0002';
			}
			else if(message.indexOf('SQLServerException') > -1){
				message = 'E0003';
			} else if (error.indexOf('Access Denied') > -1 || message.indexOf('Access Denied') > -1) {
				alert(message);
				if(self == top){
					window.location.href = '/';
				}else{
					parent.window.location.href = '/';
				}
			} else{
				message = 'E9999';
			}
			
			returnVal += message;
			notifySubmit('danger', null, '['+message+'] 오류가 발생하였습니다. 관리자에게 문의바랍니다.', null);
			return Promise.reject(returnVal);
		}
		
	  	return response;
	}catch(err){
		console.log('axios.interceptors.response Error : '+err.message);
		return false;
	}
}, function (error) {
	return Promise.reject(error);
});