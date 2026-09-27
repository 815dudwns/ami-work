$(document).ready(function() {
    var openMenu = []
    // 모바일사이즈 480이하일때
    var wwidth = $(window).width();
    var wheight = -(($(window).height()) - 52);

    if (wwidth <= 481) {
        $('#header .menu_bar a').on('click', function(e) {
            var cname = $(this).attr('class');
            var mname = cname.split('_');
            var m2name = mname[1];
            var m3name = $.trim(m2name);
            var className = $("." + m3name + "_layer");

            if (m3name == "home") {
                e.preventDefault();
            }

            function switchtext(target, value) {
                target.contents().filter(function() {
                    return this.nodeType == 3;
                }).remove().end().end().append(value);
            }

            if ($('#header .btn_app').text() == '열기') {
                switchtext($(this), '닫기');
                $('#header .btn_app').text('닫기');
                $('#header .btn_app').addClass("_open");
                $('.overlay').addClass("on");
                $('#header').css({ height: '100%' });
                $('html').css({ 'overflow': 'hidden' });
                $(className).stop().animate({ bottom: 0 }, 600, 'easeOutExpo');
                // if ($('.btn_talk').hasClass('active')) {
                //     $('#talk').stop().animate({ right: '-100%' }, 600);
                //     $('.btn_talk').removeClass('active');
                // }

                //$('#appListArea > div.app_layer > div > div.search-app > input').focus();
                // return false;
            } else {

                if (m3name == 'app') {
                    switchtext($('.menu_bar > a'), '열기');
                    //$('.menu_bar > a').text('열기');
                    $('#header .btn_app').removeClass("_open");
                    $('.overlay').removeClass("on");
                    $('#header').css({ height: '70px' });
                    $('html').css({ 'overflow': 'auto' });
                    $(this).stop().animate({ bottom: 0 }, 600, 'easeOutExpo');
                    // $(this).parent().siblings(className).not('#talk').stop().animate({ bottom: '-100%' }, 600, 'easeOutExpo');
                    // $('#talk').stop().animate({ right: '-100%' }, 600);
                    // $(this).siblings('.btn_talk').removeClass('active');
                    //$('#appListArea > div.app_layer > div > div.search-app > input').focus();

                } else {
                    if ($(this).text() == '열기') {
                        switchtext($('.menu_bar > a'), '열기');
                        $('#header .btn_app').text('닫기');
                        switchtext($(this), '닫기');
                        $("#appListArea > div[class*='_layer']").stop().animate({ bottom: '-100%' }, 600, 'easeOutExpo');
                        $(className).stop().animate({ bottom: 0 }, 600, 'easeOutExpo');
                        //$('#appListArea > div.app_layer > div > div.search-app > input').focus();
                    } else {
                        switchtext($('.menu_bar > a'), '열기');
                        $('#header .btn_app').removeClass("_open");
                        $('.overlay').removeClass("on");
                        $('#header').css({ height: '70px' });
                        $('html').css({ 'overflow': 'auto' });
                        $(className).stop().animate({ bottom: '-100%' }, 600, 'easeOutExpo');
                    }
                }

            };
        });
        $(document).mouseup(function(e){
            function switchtext(target, value) {
                target.contents().filter(function() {
                    return this.nodeType == 3;
                }).remove().end().end().append(value);
            }
            var container = $("#header .menu_bar a, #appListArea");
            if(container.has(e.target).length === 0){
                $("#appListArea > div[class*='_layer']").stop().animate({bottom: '-100%'});
                $("#header .menu_bar a[class*='btn_']").removeClass("_open");
                $('#header').css({ height: '70px' });
                switchtext($('.menu_bar > a'), '열기');
                $('.overlay').removeClass("on");
                // menuBtnClick();
            }
        });
    }
    // 사이즈 480이상일때
    if (wwidth >= 480) {
        $('#header .menu_bar a').on('click', function(e) {
            var cname = $(this).attr('class');
            var mname = cname.split('_');
            var m2name = mname[1];
            var m3name = $.trim(m2name);
            var removeClass = $("." + openMenu[0] + "_layer");


            var className = $("." + m3name + "_layer");


            if($(className).is(':animated') || $(removeClass).is(':animated')) return false;

            if (m3name == "home") {
                e.preventDefault();
            }
            function switchtext(target, value) {
                target.contents().filter(function() {
                    return this.nodeType == 3;
                }).remove().end().end().append(value);
            }

            if(openMenu.length<1){

                openMenu.push(m3name);
                $('.overlay').addClass("on");
                if(m3name == 'app') $('#header .btn_app').addClass("_open");
                $(className).stop().animate({ right: 0 }, 400, 'easeOutExpo');

            }else{

                if(openMenu.indexOf(m3name)>-1){
                    openMenu=[];
                    $(className).stop().animate({ right: '-360px'}, 400, 'easeOutExpo');
                    if(m3name == 'app') $('#header .btn_app').removeClass("_open");
                    if(openMenu.length<1) $('.overlay').removeClass("on");
                }else{

                    if(openMenu[0]=='app') $('#header .btn_app').removeClass("_open");
                    $(removeClass).css('right','-360px');

                    openMenu=[];
                    openMenu.push(m3name);

                    if(m3name == 'app') $('#header .btn_app').addClass("_open");
                    $(className).stop().animate({ right: 0 }, 400, 'easeOutExpo');
                }

            }

            if ($('#header .btn_app').text() == '열기') { // 열때


                switchtext($(this), '닫기');
                $('#header .btn_app').text('닫기');
                $('#header .btn_app').addClass("_open");
                $('.overlay').addClass("on");
                $(className).stop().animate({ right: 0 }, 600, 'easeOutExpo');
                if ($('.btn_talk').hasClass('active')) {
                	$('#talk').stop().animate({ right: '-450px' }, 600);
                	$('.btn_talk').removeClass('active');
                }
                $('#appListArea > div.app_layer > div > div.search-app > input').focus();
                // return false;
            } else {
                if (m3name == 'app') { // 닫을때
                    switchtext($('.menu_bar > a'), '열기');
                    //$('.menu_bar > a').text('열기');
                    $('#header .btn_app').removeClass("_open");
                    $('.overlay').removeClass("on");
                    $(this).parent().siblings(className).not('#talk').stop().animate({ right: '-360px' }, 600, 'easeOutExpo');
                    $('#talk').stop().animate({ right: '-450px' }, 600);
                    $(this).siblings('.btn_talk').removeClass('active');
                    $('#appListArea > div.app_layer > div > div.search-app > input').focus();
                } else {
                    if ($(this).text() == '열기') {
                        switchtext($('.menu_bar > a'), '열기');
                        $('#header .btn_app').text('닫기');
                        switchtext($(this), '닫기');
                        $("#appListArea > div[class*='_layer']").stop().animate({ right: '-360px' }, 600, 'easeOutExpo');
                        $(className).stop().animate({ right: 0 }, 600, 'easeOutExpo');
                        $('#appListArea > div.app_layer > div > div.search-app > input').focus();
                    } else {
                        switchtext($('.menu_bar > a'), '열기');
                        $('#header .btn_app').removeClass("_open");
                        $('.overlay').removeClass("on");
                        $(className).stop().animate({ right: '-360px' }, 600, 'easeOutExpo');
                    }
                }

            };

        });

        $(document).mouseup(function(e){
            function switchtext(target, value) {
                target.contents().filter(function() {
                    return this.nodeType == 3;
                }).remove().end().end().append(value);
            }
            var container = $("#header .menu_bar a, #appListArea");
            if(container.has(e.target).length === 0){
                $("#appListArea > div[class*='_layer']").stop().animate({right:'-360px'});
                $("#header .menu_bar a[class*='btn_']").removeClass("_open");
                switchtext($('.menu_bar > a'), '열기');
                $('.overlay').removeClass("on");
                // menuBtnClick();
            }

            if(e.target.className=='overlay'){
                openMenu = [];
            }

        });
    }

    // 오른쪽 메뉴 탭						
    $(".tab_box > li > p > a").on("click focus", function() {
        $(this).parent().parent().siblings().find('> div').hide();
        $(this).parent().parent().find('> div').fadeIn();
        $(this).parent().parent().addClass("on").siblings().removeClass("on");
        return false;
    });

    $('.btn_home').on('click', function() {
        portalOpen();

        if ($('#header .btn_app').text() == '닫기') {
            menuBtnClick(); //index.js
        }
    });
});