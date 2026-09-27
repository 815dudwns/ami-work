$(document).ready(function() {
  //메인 사용자정보 박스 접고, 펼침
    var wwidth = $(window).width();
    
    if (wwidth > 480) {
        $('.notice_box_slide').on('click', function() {
            if ($(this).hasClass('on')) {
                $('.notice_box .notice_box_inner>.inner_cont').fadeIn();
                $('.notice_box .notice_box_inner').stop().animate({ 'height': 200 }, 600, 'easeOutExpo');
//                $('.notice_box .notice_box_inner>.m_btn_carousel').delay(150).fadeIn();
//                $('.notice_box .notice_box_inner>.m_btn_notice').delay(150).fadeIn();
                $(this).removeClass('on');
            } else {
                $('.notice_box .notice_box_inner>.inner_cont').fadeOut();
                $('.notice_box .notice_box_inner>.m_btn_carousel').css({ 'display': 'none' });
                $('.notice_box .notice_box_inner>.m_btn_notice').css({ 'display': 'none' });
                $('.notice_box .notice_box_inner').stop().animate({ 'height': 0 }, 600, 'easeOutExpo');
                $(this).addClass('on');
            }
        });
    } else if (wwidth < 481) {
        $('.notice_box_slide').on('click', function() {
            if ($(this).hasClass('on')) {
                $('.notice_box .notice_box_inner>.inner_cont').fadeIn();
                $('.notice_box .notice_box_inner').stop().animate({ 'height': 240 }, 600, 'easeOutExpo');
                $('.notice_box .notice_box_inner>.m_btn_carousel').delay(150).fadeIn();
                $('.notice_box .notice_box_inner>.m_btn_notice').delay(150).fadeIn();
                $(this).removeClass('on');
                $(this).css({ 'bottom': '-6px' });
            } else {
                $('.notice_box .notice_box_inner>.inner_cont').fadeOut();
                $('.notice_box .notice_box_inner>.m_btn_carousel').css({ 'display': 'none' });
                $('.notice_box .notice_box_inner>.m_btn_notice').css({ 'display': 'none' });
                $('.notice_box .notice_box_inner').stop().animate({ 'height': 0 }, 600, 'easeOutExpo');
                $(this).addClass('on');
                $(this).css({ 'bottom': '-16px' });
            }
        });
    }
    
    
    // widnow resize
    $(window).resize(function(){    	 
    	$('.widget_list .widget_box').removeClass("transition");
    	//$('.widget_list .widget_box.on').closest('.widget_list').masonry('layout');
    });
    

    //메인 탭 위젯
    $(".main_tab_box > li > p > a").on("click", function() {
        $(this).parent().parent().siblings().find('> div').hide();
        $(this).parent().parent().find('> div').fadeIn();
        $(this).parent().parent().addClass("on").siblings().removeClass("on");
        $('.widget_list .widget_box').removeClass("transition");
        $(this).parent().siblings().find('.widget_list > .widget_box').addClass("transition");

        $('.widget_list > .widget_box').removeClass('on');
        // 메인 위젯리스트 그리드 설정
        var cnt = 0;

        // 애니메이션 설정
        function delayAniClass(target, delay) {
            setTimeout(function() {
                target.addClass('on');
            }, delay);
        }

        var widgetList = $(this).parent().siblings().find('.widget_list > .widget_box');
        var widgetListIdx = $(widgetList).length;

        if (wwidth > 480) {
            $($(this).parent().siblings().find('.widget_list')).masonry({
                itemSelector: '.widget_list > .widget_box',
                columnWidth: 1
            });
        } else if (wwidth < 481) {
            var option = {
                itemSelector: '.widget_list > .widget_box',
                columnWidth: 1
            };
            $grid = $('.widget_list').masonry(option);
            $grid.masonry('destroy');
        }

        for (var i = 0; i < widgetListIdx; i++) {
            var aniDelay = (i + 1) * 150;
            var aniTarget = $(widgetList).eq(i);
            delayAniClass(aniTarget, aniDelay);
        };
        
        var that = $(this);
        setTimeout(function() {
            var centerTabHeight2 = $(that).parent().siblings('.tab_content').find('.widget_list').outerHeight() + $(".main_tab_box").outerHeight() + 150;
            $(".main_tab_wrap").height(centerTabHeight2);
        }, 500);

        return false;
    });

    $(".main_tab_box > li:first > p > a").trigger('click');
    $('.main_tab_box > li:first .tab_content .widget_list .widget_box').addClass('transition');
    

    //메인 사용자정보 박스 반응형일때 슬라이더 형식으로 변환
    $('.m_btn_carousel').on('click', function() {
        $(this).siblings('.inner_cont').eq(2).addClass('on');
        $(this).siblings('.dark_layer').addClass('on');
    });
    $('.inner_cont .btn_close_m3').on('click', function() {
        $(this).parent().removeClass('on');
        $(this).parent().siblings('.dark_layer').removeClass('on');
    });
    $('.m_btn_notice').on('click', function() {
        $(this).siblings('.inner_cont').eq(0).addClass('on');
        $(this).siblings('.dark_layer').addClass('on');
    });
    $('.inner_cont .btn_close_m1').on('click', function() {
        $(this).parent().removeClass('on');
        $(this).parent().siblings('.dark_layer').removeClass('on');
    });
});

