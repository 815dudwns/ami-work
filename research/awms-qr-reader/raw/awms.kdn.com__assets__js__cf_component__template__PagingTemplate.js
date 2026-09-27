/********************************************************************************************
 * @Writer
 *  박해수 2019.01.26 
 *  
 * @Description
 * 	페이징 템플릿
 * 
 * @Syntax 
 * 	$.get('/assets/cf_component/template/PagingTemplate.html', function(response){
 *		$('head').append(response); 
 *	});
 * 	<paging :pagingset="appListPaging" :type="'normal'"></paging>
 * 
 * @Parameters
 *  pagingSet : PagingSet => appListPaging: new PagingSet(pPageCnt, pRowCnt)
 *  type : normal
 ********************************************************************************************/ 
 
Vue.component('paging', {
	props: ['pagingset', 'type', 'emptynotice'],
	template:`
		<div class="paginate" v-if="pagingset.totalCnt > 0">
		    <a href="#!" :class="{'disabled':pagingset.isPrevPage()}" :title="'이전 '+pagingset.pageCnt+'개 페이지'" @click="pagingset.prevPageSetClick()" class="first"><span class="icon-chevrons-left"></span></a>
	        <a href="#!" :class="{'disabled':pagingset.isPrev()}" class="prev" title="이전 페이지" @click="pagingset.prevClick()"><span class="icon-chevron-left"></span></a>
	        <span class="pc">
	            <a href="#!" :class="{'active':pagingset.currentPage == item.pageNo}" v-for="(item, index) in pagingset.pageList" @click="pagingset.movePage(item.pageNo)">{{item.pageNo}}</a>
	        </span>
	        <span class="mo">
	        	<span class="present">{{pagingset.getCurrentPage()}}</span>/<span class="total">{{pagingset.getTotalPage()}}</span>
	        </span>
	        <a href="#!" :class="{'disabled':pagingset.isNext()}" class="next" title="다음페이지" @click="pagingset.nextClick()"><span class="icon-chevron-right"></span></a>
	        <a href="#!" :class="{'disabled':pagingset.isNextPage()}" :title="'다음 '+pagingset.pageCnt+'개 페이지'" @click="pagingset.nextPageSetClick()" class="last"><span class="icon-chevrons-right"></span></a>
	    </div>
	    <div class="box-type03 center" v-else>검색결과가 없습니다.</div>
	`
});
