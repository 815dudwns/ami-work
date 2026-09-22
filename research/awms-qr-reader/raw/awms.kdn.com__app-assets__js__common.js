Vue.mixin({
	data: function () {
		return {
		};
	},
	created: function () {
	},
	methods: {
		makeComma : function(str) {
			 str = String(str);
			 return str.replace(/(\d)(?=(?:\d{3})+(?!\d))/g, '$1,');
		},
		reportUrl : function(filePath,paramObj){
			var host = location.host;
			var reportHost = 'report.kren.kr';
			if(!(host == 'www.kren.kr' || host == 'kren.kr' || host == 'kren.ne.kr')) reportHost = 'report.dev.kren.kr';
			var url = 'https://'+reportHost+'/ubi4/ubihtml.jsp';
			url += '?file='+filePath;
			if(Object.keys(paramObj).length > 0) url += '&arg=';
			var cnt = 0;
			for ( var key in paramObj) {
				if(cnt == 0) url += key+'%23'+paramObj[key];
				else url += '%23'+key+'%23'+paramObj[key];
				cnt++;
			}
			
			return url;
		},
		commFormatDate : function(dt) {
			const date = new Date(new Number(dt));
			const yyyy = date.getFullYear();
			const mm = String(date.getMonth()+1).padStart(2,'0');
			const dd = String(date.getDate()).padStart(2,'0');

		    return `${yyyy}-${mm}-${dd}`;
		},
		commFormatDateTime : function(dt) {
			const date = new Date(new Number(dt));
			const yyyy = date.getFullYear();
			const mm = String(date.getMonth()+1).padStart(2,'0');
			const dd = String(date.getDate()).padStart(2,'0');
			
			const hh = String(date.getHours()).padStart(2,'0');
			const min = String(date.getMinutes()).padStart(2,'0');
			const ss = String(date.getSeconds()).padStart(2,'0');
			
		    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
		}
	}
});
